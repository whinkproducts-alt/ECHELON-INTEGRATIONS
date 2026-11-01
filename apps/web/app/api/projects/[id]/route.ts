export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { randomUUID } from 'crypto';
import { writeLedger } from '@/lib/ledger';
import { checkPermission } from '@/lib/permission-engine';
import { accessibleProjectWhere, isProjectOwner } from '@/lib/project-access';
import { ProjectUpdateSchema, parseJson } from '@/lib/project-input';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const where = { AND: [{ id }, accessibleProjectWhere(session.user.id)] }; // owner-or-member scope
  const project = await prisma.project.findFirst({
    where,
    include: {
      tasks: { orderBy: { updatedAt: 'desc' } },
      milestones: { orderBy: { createdAt: 'desc' } },
      decisions: { orderBy: { decidedAt: 'desc' } },
      risks: true,
      openQuestions: true,
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(project);
}

async function update(req: NextRequest, params: Promise<{ id: string }>) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;
  const parsed = ProjectUpdateSchema.safeParse(await parseJson(req));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid project update' }, { status: 400 });
  const body = parsed.data;
  const hasSub = body.subsidiary !== undefined;
  const correlationId = randomUUID();
  const led = (status: 'EXECUTED' | 'DENIED' | 'FAILED', metadata: Record<string, unknown>, action = 'project_update') =>
    writeLedger({ userId, action, permissionClass: 'A', status, initiator: 'user', persona: 'WHINK', correlationId, metadata: { projectId: id, ...metadata } });

  const perm = await checkPermission(userId, 'project_update', 'A', correlationId);
  if (!perm.allowed) {
    await led('DENIED', { reason: perm.reason ?? 'denied' });
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  }
  // Members may read but never update: non-owners get the same 404 as unknown ids.
  if (!(await isProjectOwner(userId, id))) {
    await led('FAILED', { reason: 'not_found' });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const data = {
    name: body.name,
    goal: body.goal,
    description: body.description,
    status: body.status,
    ...(hasSub ? { subsidiary: body.subsidiary } : {}),
  };
  try {
    // Read "before" and write in one transaction so racing PATCHes cannot record a wrong "before".
    const outcome = await prisma.$transaction(async (tx) => {
      const existing = await tx.project.findFirst({ where: { id, ownerId: userId }, select: { subsidiary: true } });
      if (!existing) return null;
      const res = await tx.project.updateMany({ where: { id, ownerId: userId }, data });
      return res.count > 0 ? { before: existing.subsidiary ?? null } : null;
    });
    if (!outcome) {
      await led('FAILED', { reason: 'not_found' });
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await led('EXECUTED', { fields: Object.keys(body).filter((k) => k !== 'subsidiary') });
    if (hasSub && outcome.before !== body.subsidiary) {
      await led('EXECUTED', { before: outcome.before, after: body.subsidiary }, 'project_subsidiary_set');
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    await led('FAILED', { error: e instanceof Error ? e.message.slice(0, 200) : 'error' });
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return update(req, params);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return update(req, params);
}

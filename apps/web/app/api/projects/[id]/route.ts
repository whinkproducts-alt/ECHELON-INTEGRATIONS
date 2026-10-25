export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { isSubsidiaryId } from '@/lib/subsidiaries';
import { writeLedger } from '@/lib/ledger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, ownerId: session.user.id },
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
  const body = await req.json();
  const hasSub = Object.prototype.hasOwnProperty.call(body, 'subsidiary') && body.subsidiary !== undefined;
  if (hasSub && body.subsidiary !== null && !isSubsidiaryId(body.subsidiary)) {
    return NextResponse.json({ error: 'Invalid subsidiary' }, { status: 400 });
  }
  let before: string | null = null;
  if (hasSub) {
    const existing = await prisma.project.findFirst({ where: { id, ownerId: userId }, select: { subsidiary: true } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    before = existing.subsidiary ?? null;
  }
  const res = await prisma.project.updateMany({
    where: { id, ownerId: userId },
    data: {
      name: body.name,
      goal: body.goal,
      description: body.description,
      status: body.status,
      ...(hasSub ? { subsidiary: body.subsidiary } : {}),
    },
  });
  if (hasSub && res.count > 0 && before !== body.subsidiary) {
    await writeLedger({
      userId,
      action: 'project_subsidiary_set',
      permissionClass: 'A',
      status: 'EXECUTED',
      initiator: 'user',
      metadata: { projectId: id, before, after: body.subsidiary },
    });
  }
  return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return update(req, params);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return update(req, params);
}

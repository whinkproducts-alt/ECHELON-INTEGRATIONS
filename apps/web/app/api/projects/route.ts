export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { randomUUID } from 'crypto';
import { checkPermission } from '@/lib/permission-engine';
import { writeLedger } from '@/lib/ledger';
import { ProjectCreateSchema, parseJson } from '@/lib/project-input';
import { cardFor, listAccessibleProjects, statsForProjects } from '@/lib/project-cards';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const projects = await listAccessibleProjects(session.user.id);
  const stats = await statsForProjects(projects.map((p: { id: string }) => p.id));
  // Additive: every existing field stays, ProjectCard fields are layered on top.
  return NextResponse.json(
    projects.map((p: any) => ({
      ...p,
      ...cardFor(p, stats.get(p.id)),
      openTaskCount: (stats.get(p.id)?.tasksTotal ?? 0) - (stats.get(p.id)?.tasksDone ?? 0),
    })),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const parsed = ProjectCreateSchema.safeParse(await parseJson(req));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
  const body = parsed.data;
  const correlationId = randomUUID();
  const led = (status: 'EXECUTED' | 'DENIED' | 'FAILED', metadata: Record<string, unknown>) =>
    writeLedger({ userId, action: 'project_create', permissionClass: 'A', status, initiator: 'user', persona: 'WHINK', correlationId, metadata });

  const perm = await checkPermission(userId, 'project_create', 'A', correlationId);
  if (!perm.allowed) {
    await led('DENIED', { reason: perm.reason ?? 'denied' });
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  }
  try {
    const project = await prisma.project.create({
      data: {
        name: body.name,
        goal: body.goal ?? null,
        description: body.description ?? null,
        subsidiary: body.subsidiary ?? null,
        ownerId: userId,
      },
    });
    // Add owner as member
    await prisma.projectMember.create({
      data: { projectId: project.id, userId, role: 'owner' },
    });
    await led('EXECUTED', { projectId: project.id, subsidiary: project.subsidiary ?? null });
    return NextResponse.json(project);
  } catch (e) {
    await led('FAILED', { error: e instanceof Error ? e.message.slice(0, 200) : 'error' });
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

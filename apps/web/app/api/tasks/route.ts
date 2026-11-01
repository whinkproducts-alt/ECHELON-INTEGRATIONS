export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { assertOwnedProject } from '@/lib/project-access';
import { validateTaskInput } from '@/lib/task-input';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const tasks = await prisma.projectTask.findMany({
    where: {
      project: { ownerId: session.user.id },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: { project: { select: { name: true } } },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (typeof body.projectId !== 'string' || body.projectId.length === 0) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }
  const projectId = await assertOwnedProject(session.user.id, body.projectId);
  if (!projectId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const parsed = validateTaskInput(body, { allowAssignee: true, allowStatus: true });
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;
  const task = await prisma.projectTask.create({
    data: {
      projectId,
      title: v.title,
      description: v.description,
      priority: v.priority,
      assignee: v.assignee,
      dueDate: v.dueDate,
      status: v.status ?? 'TODO',
      source: 'user',
    },
  });
  return NextResponse.json(task);
}

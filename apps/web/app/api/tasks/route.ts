export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

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
  const body = await req.json();
  // Verify project ownership
  const project = await prisma.project.findFirst({ where: { id: body.projectId, ownerId: session.user.id } });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const task = await prisma.projectTask.create({
    data: {
      projectId: body.projectId,
      title: body.title,
      description: body.description ?? null,
      priority: body.priority ?? 'MEDIUM',
      assignee: body.assignee ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      status: body.status ?? 'TODO',
      source: 'user',
    },
  });
  return NextResponse.json(task);
}

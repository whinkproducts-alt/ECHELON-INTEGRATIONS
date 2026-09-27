export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const project = await prisma.project.updateMany({
    where: { id, ownerId: session.user.id },
    data: {
      name: body.name,
      goal: body.goal,
      description: body.description,
      status: body.status,
    },
  });
  return NextResponse.json({ success: true });
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const task = await prisma.projectTask.findFirst({
    where: { id, project: { ownerId: session.user.id } },
  });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.projectTask.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.assignee !== undefined ? { assignee: body.assignee } : {}),
    },
  });
  return NextResponse.json(updated);
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const projects = await prisma.project.findMany({
    where: { ownerId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    include: { tasks: { where: { status: { not: 'DONE' } }, select: { id: true } } },
  });
  return NextResponse.json(projects.map((p: any) => ({ ...p, openTaskCount: p.tasks?.length ?? 0, tasks: undefined })));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const project = await prisma.project.create({
    data: {
      name: body.name,
      goal: body.goal ?? null,
      description: body.description ?? null,
      ownerId: session.user.id,
    },
  });
  // Add owner as member
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: session.user.id, role: 'owner' },
  });
  return NextResponse.json(project);
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { isSubsidiaryId } from '@/lib/subsidiaries';
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
  const body = await req.json();
  if (body.subsidiary !== undefined && body.subsidiary !== null && !isSubsidiaryId(body.subsidiary)) {
    return NextResponse.json({ error: 'Invalid subsidiary' }, { status: 400 });
  }
  const project = await prisma.project.create({
    data: {
      name: body.name,
      goal: body.goal ?? null,
      description: body.description ?? null,
      subsidiary: body.subsidiary ?? null,
      ownerId: session.user.id,
    },
  });
  // Add owner as member
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: session.user.id, role: 'owner' },
  });
  return NextResponse.json(project);
}

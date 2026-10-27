export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { accessibleProjectWhere } from '@/lib/project-access';
import { getSubsidiary } from '@/lib/subsidiaries';
import { toProgress } from '@/lib/project-cards';

type Ctx = { params: Promise<{ id: string }> };

/** Full project report. Owners and members can read; everyone else gets 404. Free text is returned as is (untrusted data). */
export async function GET(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await params;
  const where = { AND: [{ id }, accessibleProjectWhere(a.userId)] }; // owner-or-member scope
  const project = await prisma.project.findFirst({
    where,
    include: {
      tasks: { orderBy: { createdAt: 'asc' } },
      milestones: { orderBy: [{ targetDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }] },
      decisions: { orderBy: { decidedAt: 'desc' } },
      risks: { orderBy: { createdAt: 'desc' } },
      openQuestions: { orderBy: { createdAt: 'desc' } },
      members: { include: { user: { select: { name: true } } } },
    },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sub = project.subsidiary ? getSubsidiary(project.subsidiary) : null;
  const done = project.tasks.filter((t: { status: string }) => t.status === 'DONE').length;
  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      goal: project.goal,
      description: project.description,
      status: project.status,
      subsidiary: project.subsidiary,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    subsidiary: sub ? { id: sub.id, name: sub.name, logo: sub.logo } : null,
    progress: toProgress(project.tasks.length, done),
    tasks: project.tasks,
    milestones: project.milestones,
    decisions: project.decisions,
    risks: project.risks,
    openQuestions: project.openQuestions,
    members: project.members.map((m: { userId: string; role: string; user?: { name: string | null } | null }) => ({
      userId: m.userId,
      role: m.role,
      name: m.user?.name ?? null,
    })),
  });
}

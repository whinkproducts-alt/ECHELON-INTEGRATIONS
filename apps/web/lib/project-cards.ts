import { prisma } from '@/lib/db';
import { accessibleProjectWhere } from '@/lib/project-access';

/** Status values treated as closed. Schema has no enum; defaults are OPEN/PENDING/TODO. */
const CLOSED_RISK = ['CLOSED', 'MITIGATED', 'RESOLVED'];
const CLOSED_QUESTION = ['ANSWERED', 'RESOLVED', 'CLOSED'];
const DONE_MILESTONE = ['COMPLETED', 'DONE'];

export interface ProjectStats {
  tasksTotal: number;
  tasksDone: number;
  percent: number;
  nextMilestone: { title: string; dueDate: string | null } | null;
  openRisks: number;
  openQuestions: number;
}

export const emptyStats = (): ProjectStats => ({
  tasksTotal: 0, tasksDone: 0, percent: 0, nextMilestone: null, openRisks: 0, openQuestions: 0,
});

export function toProgress(total: number, done: number) {
  return { tasksTotal: total, tasksDone: done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/**
 * Per-project aggregates for already-access-checked project ids.
 * Exactly four queries regardless of project count (no N+1).
 */
export async function statsForProjects(projectIds: string[]): Promise<Map<string, ProjectStats>> {
  const out = new Map<string, ProjectStats>();
  for (const id of projectIds) out.set(id, emptyStats());
  if (projectIds.length === 0) return out;

  const [taskGroups, milestones, riskGroups, questionGroups] = await Promise.all([
    prisma.projectTask.groupBy({ by: ['projectId', 'status'], where: { projectId: { in: projectIds } }, _count: { _all: true } }),
    prisma.projectMilestone.findMany({
      where: { projectId: { in: projectIds }, completedAt: null, status: { notIn: DONE_MILESTONE } },
      orderBy: [{ targetDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select: { projectId: true, title: true, targetDate: true },
    }),
    prisma.projectRisk.groupBy({ by: ['projectId'], where: { projectId: { in: projectIds }, status: { notIn: CLOSED_RISK } }, _count: { _all: true } }),
    prisma.projectOpenQuestion.groupBy({ by: ['projectId'], where: { projectId: { in: projectIds }, answeredAt: null, status: { notIn: CLOSED_QUESTION } }, _count: { _all: true } }),
  ]);

  for (const g of taskGroups as Array<{ projectId: string; status: string; _count: { _all: number } }>) {
    const s = out.get(g.projectId);
    if (!s) continue;
    s.tasksTotal += g._count._all;
    if (g.status === 'DONE') s.tasksDone += g._count._all;
  }
  for (const s of out.values()) s.percent = toProgress(s.tasksTotal, s.tasksDone).percent;
  for (const m of milestones as Array<{ projectId: string; title: string; targetDate: Date | null }>) {
    const s = out.get(m.projectId);
    if (s && !s.nextMilestone) s.nextMilestone = { title: m.title, dueDate: m.targetDate ? m.targetDate.toISOString() : null };
  }
  for (const g of riskGroups as Array<{ projectId: string; _count: { _all: number } }>) {
    const s = out.get(g.projectId);
    if (s) s.openRisks = g._count._all;
  }
  for (const g of questionGroups as Array<{ projectId: string; _count: { _all: number } }>) {
    const s = out.get(g.projectId);
    if (s) s.openQuestions = g._count._all;
  }
  return out;
}

export interface ProjectCard {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  subsidiary: string | null;
  updatedAt: string;
  progress: { tasksTotal: number; tasksDone: number; percent: number };
  nextMilestone: { title: string; dueDate: string | null } | null;
  openRisks: number;
  openQuestions: number;
}

type BaseProject = { id: string; name: string; goal: string | null; status: string; subsidiary: string | null; updatedAt: Date };

export function cardFor<T extends BaseProject>(p: T, s: ProjectStats | undefined) {
  const st = s ?? emptyStats();
  return {
    id: p.id,
    name: p.name,
    goal: p.goal ?? null,
    status: p.status,
    subsidiary: p.subsidiary ?? null,
    updatedAt: p.updatedAt.toISOString(),
    progress: toProgress(st.tasksTotal, st.tasksDone),
    nextMilestone: st.nextMilestone,
    openRisks: st.openRisks,
    openQuestions: st.openQuestions,
  } satisfies ProjectCard;
}

/** Projects the user owns or is a member of, optionally filtered by subsidiary ('unassigned' = null). */
export async function listAccessibleProjects(userId: string, subsidiary?: string | 'unassigned') {
  const filter = subsidiary === undefined ? {} : subsidiary === 'unassigned' ? { subsidiary: null } : { subsidiary };
  const where = { AND: [accessibleProjectWhere(userId), filter] }; // owner-or-member scope
  return prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  });
}

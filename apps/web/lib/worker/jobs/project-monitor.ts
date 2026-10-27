/**
 * project_monitor: flags stalled projects, overdue milestones and piled-up open risks for one
 * subsidiary as Recommendation rows with a deep link. No model call, read-only on projects.
 */
import { prisma } from '@/lib/db';
import { accessibleProjectWhere } from '@/lib/project-access';
import { getSubsidiary } from '@/lib/subsidiaries';
import { workerWriteRecommendation, type JobContext } from '@/lib/worker/context';
import { isoWeek, THRESHOLD } from '@/lib/worker/jobs/util';

const DONE = new Set(['COMPLETED', 'DONE', 'CANCELLED']);

export function projectLink(subsidiary: string, projectId: string): string {
  return `/dashboard/subsidiaries/${subsidiary}/projects/${projectId}`;
}

export async function projectMonitor(ctx: JobContext): Promise<void> {
  const sub = getSubsidiary(ctx.params.subsidiary ?? '');
  if (!sub) throw new Error('unknown subsidiary');
  const stalledDays = THRESHOLD('WORKER_STALLED_DAYS', 14);
  const riskLimit = THRESHOLD('WORKER_RISK_PILEUP', 3);
  const scope = accessibleProjectWhere(ctx.userId); // owner or member, same rule as the projects API
  const projects = await prisma.project.findMany({
    where: { AND: [scope, { status: 'ACTIVE', subsidiary: sub.id }] },
    take: 100,
    select: {
      id: true, name: true, updatedAt: true,
      tasks: { orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
      milestones: { select: { title: true, status: true, targetDate: true, completedAt: true } },
      risks: { where: { status: 'OPEN' }, select: { severity: true } },
    },
  }) as Array<{
    id: string; name: string; updatedAt: Date;
    tasks: Array<{ updatedAt: Date }>;
    milestones: Array<{ title: string; status: string; targetDate: Date | null; completedAt: Date | null }>;
    risks: Array<{ severity: string }>;
  }>;
  ctx.counters.items = projects.length;
  const week = isoWeek(ctx.now);
  const source = ctx.entry?.name ?? 'Project monitor';

  for (const p of projects) {
    const link = projectLink(sub.id, p.id);
    const last = Math.max(p.updatedAt.getTime(), p.tasks[0]?.updatedAt.getTime() ?? 0);
    const idleDays = Math.floor((ctx.now.getTime() - last) / 86_400_000);
    if (idleDays >= stalledDays) {
      await workerWriteRecommendation(ctx, {
        source, kind: 'project_stalled', severity: 'warning', link, dedupeKey: `stalled:${p.id}:${week}`,
        title: `${p.name} has had no update for ${idleDays} days`,
        body: `${sub.name}: nothing has changed on this project in ${idleDays} days (limit ${stalledDays}). Decide whether to push, park or close it.`,
      });
    }
    const overdue = p.milestones.filter((m) => !DONE.has(m.status) && !m.completedAt && m.targetDate && m.targetDate.getTime() < ctx.now.getTime());
    if (overdue.length > 0) {
      await workerWriteRecommendation(ctx, {
        source, kind: 'milestone_overdue', severity: 'warning', link, dedupeKey: `overdue:${p.id}:${week}`,
        title: `${p.name}: ${overdue.length} overdue milestone${overdue.length === 1 ? '' : 's'}`,
        body: `${sub.name}: ${overdue.length} milestone${overdue.length === 1 ? ' is' : 's are'} past the target date and not complete.`,
      });
    }
    const highRisks = p.risks.filter((r) => ['HIGH', 'CRITICAL'].includes(r.severity.toUpperCase())).length;
    if (p.risks.length >= riskLimit + 2 || highRisks >= riskLimit) {
      await workerWriteRecommendation(ctx, {
        source, kind: 'risks_piling_up', severity: highRisks >= riskLimit ? 'critical' : 'warning', link, dedupeKey: `risks:${p.id}:${week}`,
        title: `${p.name}: ${p.risks.length} open risks`,
        body: `${sub.name}: ${p.risks.length} open risks, ${highRisks} high or critical. Review mitigations.`,
      });
    }
  }
}

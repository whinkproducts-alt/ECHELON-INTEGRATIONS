/**
 * security_watch: counts security-relevant ledger rows for one scope in the last window and
 * raises a Recommendation when a threshold is exceeded. Counts only; never reads or copies row content.
 */
import { prisma } from '@/lib/db';
import { workerWriteRecommendation, type JobContext } from '@/lib/worker/context';
import { THRESHOLD } from '@/lib/worker/jobs/util';

const WINDOW_MS = 3_600_000;

type Where = Record<string, unknown>;
const SCOPES: Record<string, { label: string; threshold: string; fallback: number; where: Where }> = {
  denials: { label: 'denied actions', threshold: 'WORKER_SEC_DENIALS', fallback: 10, where: { status: 'DENIED' } },
  injection: {
    label: 'blocked untrusted-content events', threshold: 'WORKER_SEC_INJECTION', fallback: 3,
    where: { OR: [{ action: { contains: 'injection', mode: 'insensitive' } }, { action: { contains: 'blocked', mode: 'insensitive' } }, { action: { contains: 'flagged', mode: 'insensitive' } }] },
  },
  protected: {
    label: 'protected-action and approval security events', threshold: 'WORKER_SEC_PROTECTED', fallback: 3,
    where: { action: { startsWith: 'SECURITY_EVENT' } },
  },
};

export async function securityWatch(ctx: JobContext): Promise<void> {
  const scope = SCOPES[ctx.params.scope ?? ''];
  if (!scope) throw new Error('unknown security scope');
  const since = new Date(ctx.now.getTime() - WINDOW_MS);
  const count = await prisma.action.count({ where: { userId: ctx.userId, createdAt: { gte: since }, ...scope.where } });
  ctx.counters.items = count;
  const limit = THRESHOLD(scope.threshold, scope.fallback);
  if (count < limit) return;
  const bucket = ctx.now.toISOString().slice(0, 13);
  await workerWriteRecommendation(ctx, {
    source: ctx.entry?.name ?? 'Security watch', kind: 'security', link: '/dashboard/security',
    severity: count >= limit * 3 ? 'critical' : 'warning',
    title: `${count} ${scope.label} in the last hour`,
    body: `The ledger shows ${count} ${scope.label} in the last hour (threshold ${limit}). Open the security screen to review. Counts only; no content is copied here.`,
    dedupeKey: `sec:${ctx.params.scope}:${bucket}`,
  });
}

/**
 * Job table: creation, atomic claiming, completion. Safe with several worker processes.
 *
 * Claiming is one statement: UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING.
 * Two workers can never get the same row, and an expired lease (crashed worker) becomes claimable.
 * The queue itself is global by nature (the worker serves every account); every row carries its
 * userId and everything a job does afterwards is scoped to that userId.
 */
import { prisma } from '@/lib/db';
import { getRoster, SYSTEM_JOBS, type JobType, type RosterEntry } from '@/lib/worker/roster';
import { backoffMs, intervalOrThrow } from '@/lib/worker/schedule';
import { sha256 } from '@/lib/worker/jobs/util';

export const LEASE_MS = 10 * 60_000;

export interface DesiredJob { jobKey: string; job: JobType; intervalMs: number; entry: RosterEntry | null; critical: boolean }

export function desiredJobs(): DesiredJob[] {
  const out: DesiredJob[] = [];
  for (const e of getRoster()) {
    if (!e.enabled || !e.job) continue;
    out.push({ jobKey: `${e.job}:${e.key}`, job: e.job, intervalMs: intervalOrThrow(e.schedule), entry: e, critical: false });
  }
  for (const s of SYSTEM_JOBS) out.push({ jobKey: `${s.job}:${s.key}`, job: s.job, intervalMs: intervalOrThrow(s.schedule), entry: null, critical: true });
  return out;
}

export function resolveJob(jobKey: string): DesiredJob | null {
  return desiredJobs().find((d) => d.jobKey === jobKey) ?? null;
}

/** Users that have a conversation or a named profile (onboarding done). Ids only. */
export async function discoverUsers(limit = 5000): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { OR: [{ conversations: { some: {} } }, { profile: { is: { displayName: { not: null } } } }] },
    select: { id: true }, take: limit,
  }) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/** Stable stagger so a new user's jobs do not all fire in the same tick. */
export function staggerMs(jobKey: string, userId: string, intervalMs: number): number {
  const n = Number.parseInt(sha256(`${jobKey}:${userId}`).slice(0, 8), 16);
  return n % Math.min(intervalMs, 10 * 60_000);
}

/** Create the missing job rows for one user. Returns how many were created. */
export async function ensureJobs(userId: string, now = new Date()): Promise<number> {
  if (!userId) throw new Error('ensureJobs: userId is required');
  const want = desiredJobs();
  const have = await prisma.agentJob.findMany({ where: { userId }, select: { jobKey: true } }) as Array<{ jobKey: string }>;
  const haveSet = new Set(have.map((h) => h.jobKey));
  const missing = want.filter((w) => !haveSet.has(w.jobKey));
  if (missing.length === 0) return 0;
  const res = await prisma.agentJob.createMany({
    data: missing.map((m) => ({ jobKey: m.jobKey, userId, nextRunAt: new Date(now.getTime() + staggerMs(m.jobKey, userId, m.intervalMs)) })),
    skipDuplicates: true,
  });
  return res.count;
}

export interface ClaimedJob { id: string; jobKey: string; userId: string; consecutiveFailures: number; runs: number }

export async function claimDueJobs(workerId: string, limit: number, now = new Date()): Promise<ClaimedJob[]> {
  if (limit <= 0) return [];
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  return prisma.$queryRaw<ClaimedJob[]>`
    UPDATE agent_jobs SET "leaseUntil" = ${leaseUntil}, "leaseOwner" = ${workerId}
    WHERE id IN (
      SELECT id FROM agent_jobs
      WHERE "nextRunAt" <= ${now} AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})
      ORDER BY "nextRunAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "jobKey", "userId", "consecutiveFailures", runs`;
}

export type JobOutcome = 'OK' | 'FAILED' | 'SKIPPED' | 'TIMEOUT';

/** Release the lease and schedule the next run. Only succeeds while we still hold the lease. */
export async function completeJob(job: ClaimedJob, workerId: string, outcome: JobOutcome, intervalMs: number, reason: string | null, now = new Date()): Promise<boolean> {
  const failed = outcome === 'FAILED' || outcome === 'TIMEOUT';
  const failures = failed ? job.consecutiveFailures + 1 : outcome === 'OK' ? 0 : job.consecutiveFailures;
  const res = await prisma.agentJob.updateMany({
    where: { id: job.id, userId: job.userId, leaseOwner: workerId },
    data: {
      lastRunAt: now, lastStatus: outcome, lastError: reason ? reason.replace(/\s+/g, ' ').slice(0, 160) : null,
      leaseUntil: null, leaseOwner: null,
      runs: outcome === 'SKIPPED' ? job.runs : job.runs + 1,
      consecutiveFailures: failures,
      nextRunAt: new Date(now.getTime() + backoffMs(intervalMs, failed ? failures : 0)),
    },
  });
  return res.count === 1;
}

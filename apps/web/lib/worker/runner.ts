/**
 * One worker tick and one job run. The loop around it lives in scripts/worker.ts.
 */
import { prisma } from '@/lib/db';
import { logger, generateCorrelationId } from '@/lib/logger';
import { budgetState } from '@/lib/budget';
import { connectivityMode, offlineFallbackEnabled, ollamaReachable } from '@/lib/offline';
import { recordActionSafe } from '@/lib/ledger';
import { JOBS } from '@/lib/worker/jobs';
import { assertNoTools, ledgerRun, makeContext } from '@/lib/worker/context';
import { claimDueJobs, completeJob, discoverUsers, ensureJobs, resolveJob, type ClaimedJob, type JobOutcome } from '@/lib/worker/scheduler';

export const WORKER_VERSION = '1';

export function workerConcurrency(env = process.env): number {
  const n = Number.parseInt(env.WORKER_CONCURRENCY ?? '', 10);
  return Number.isFinite(n) && n >= 1 && n <= 32 ? n : 3;
}
export function jobTimeoutMs(env = process.env): number {
  const n = Number.parseInt(env.WORKER_JOB_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(n) && n >= 1000 ? Math.min(n, 9 * 60_000) : 120_000;
}

export async function heartbeat(workerId: string, startedAt: Date): Promise<void> {
  const now = new Date();
  await prisma.agentHeartbeat.upsert({
    where: { workerId },
    create: { workerId, startedAt, lastSeenAt: now, version: WORKER_VERSION },
    update: { lastSeenAt: now, version: WORKER_VERSION },
  });
}

/** Ledger a skip at most once per user, job and reason per UTC day. */
async function ledgerSkipOnce(userId: string, jobKey: string, reason: string, correlationId: string, now: Date): Promise<void> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const summary = `job=${jobKey} reason=${reason}`;
  const existing = await prisma.action.findFirst({ where: { userId, action: 'worker_job_skipped', inputSummary: summary, createdAt: { gte: dayStart } }, select: { id: true } });
  if (existing) return;
  await recordActionSafe({ userId, initiator: 'system', persona: 'WHINK', action: 'worker_job_skipped', permissionClass: 'A', status: 'VALIDATED', inputSummary: summary, correlationId });
}

export async function skipReason(userId: string, usesModel: boolean, critical: boolean): Promise<string | null> {
  const b = await budgetState(userId);
  if (b.state === 'hard') return 'budget_hard';
  if (b.state === 'soft' && !critical) return 'budget_soft';
  if (usesModel && (await connectivityMode()) === 'offline') {
    if (!offlineFallbackEnabled()) return 'offline';
    if (!(await ollamaReachable())) return 'offline_no_local';
  }
  return null;
}

/** Runs one claimed job to completion (never throws). */
export async function runClaimedJob(job: ClaimedJob, workerId: string, now = new Date()): Promise<JobOutcome> {
  if (job.jobKey.startsWith('ear:')) {
    const { runEarJob } = await import('@/lib/worker/ear-execution');
    return runEarJob(job, workerId, now);
  }
  const desired = resolveJob(job.jobKey);
  const correlationId = generateCorrelationId();
  if (!desired) {
    // Removed from the roster or disabled: park it for a day.
    await completeJob(job, workerId, 'SKIPPED', 86_400_000, 'not_in_roster', now);
    return 'SKIPPED';
  }
  const def = JOBS[desired.job];
  let outcome: JobOutcome = 'OK';
  let reason: string | null = null;
  const started = Date.now();
  try {
    const skip = await skipReason(job.userId, def.usesModel, def.critical || desired.critical);
    if (skip) {
      await ledgerSkipOnce(job.userId, job.jobKey, skip, correlationId, now);
      await completeJob(job, workerId, 'SKIPPED', desired.intervalMs, skip, now);
      return 'SKIPPED';
    }
    const ac = new AbortController();
    const ctx = makeContext({
      userId: job.userId, correlationId, jobKey: job.jobKey, jobType: desired.job, entry: desired.entry,
      params: desired.entry?.params ?? {}, now, signal: ac.signal,
    });
    assertNoTools(ctx);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { ac.abort(); rej(new Error('timeout')); }, jobTimeoutMs()); });
    try {
      await Promise.race([def.run(ctx), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    await ledgerRun(ctx, 'EXECUTED', started);
  } catch (e) {
    const msg = (e as Error)?.message ?? 'error';
    outcome = msg === 'timeout' ? 'TIMEOUT' : 'FAILED';
    reason = msg === 'timeout' ? 'timeout' : msg.slice(0, 120);
    logger.error('worker job failed', { userId: job.userId, jobKey: job.jobKey, correlationId, error: reason });
    await recordActionSafe({
      userId: job.userId, initiator: 'system', persona: 'WHINK', action: 'worker_job_run', permissionClass: 'A', status: 'FAILED',
      inputSummary: `job=${job.jobKey}`, outputSummary: outcome === 'TIMEOUT' ? 'timeout' : 'job failed', correlationId, latencyMs: Date.now() - started,
    });
  }
  await completeJob(job, workerId, outcome, desired.intervalMs, reason, new Date());
  return outcome;
}

export interface TickState { lastDiscoverAt: number; inFlight: Set<Promise<unknown>> }
export const DISCOVER_EVERY_MS = 5 * 60_000;

/** One loop iteration: heartbeat, discover users now and then, claim up to the free slots, start them. */
export async function tick(workerId: string, startedAt: Date, state: TickState, concurrency = workerConcurrency(), nowMs = Date.now()): Promise<number> {
  await heartbeat(workerId, startedAt);
  if (nowMs - state.lastDiscoverAt >= DISCOVER_EVERY_MS) {
    state.lastDiscoverAt = nowMs;
    for (const userId of await discoverUsers()) {
      try { await ensureJobs(userId, new Date(nowMs)); } catch (e) { logger.warn('ensureJobs failed', { userId, error: (e as Error)?.message }); }
    }
  }
  const free = concurrency - state.inFlight.size;
  const claimed = await claimDueJobs(workerId, free, new Date(nowMs));
  for (const job of claimed) {
    const p = runClaimedJob(job, workerId).catch((e) => logger.error('worker run crashed', { jobKey: job.jobKey, error: (e as Error)?.message }));
    state.inFlight.add(p);
    void p.finally(() => state.inFlight.delete(p));
  }
  return claimed.length;
}

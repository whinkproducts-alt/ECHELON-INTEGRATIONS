/**
 * Swarm execution engine. State lives in the DB, so a crash loses nothing:
 * - dependency-ordered DAG, bounded concurrency (process-wide), per-task timeout and retries
 * - a task runs only after it wins the exclusive (runId, lane) claim; the unique index decides, not app code
 * - a failed task never blocks independent lanes; its dependents run on what is left or are skipped
 * - cancel and the per-run token cap are checked between tasks
 * - agents get no tools; their output is parsed as strict JSON and sanitised
 * Every query carries userId.
 */
import { createHash, randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { writeLedger } from '@/lib/ledger';
import { logSecurityEvent } from '@/lib/permission-engine';
import { recordUsage } from '@/lib/usage';
import { getOrgKit } from '@/lib/agent-loader';
import { budgetState } from '@/lib/budget';
import { swarmConfig } from './config';
import { callAgent, normalizeLearning } from './agent-call';
import { swarmModel } from './planner';
import { finalizeRun } from './finalize';
import type { AssignedTask, SwarmRole } from './types';

type TaskRow = {
  id: string; runId: string; userId: string; lane: string; role: string; agentId: string; fit: string;
  title: string; objective: string; deliverable: string; requiredSkills: string[]; covers: string[];
  dependsOn: string[]; estimatedCalls: number; status: string; attempts: number; output: unknown;
};

/** A RUNNING task is dead when its last heartbeat (else its start) is older than the cutoff. No timestamp at all counts as dead. */
function staleAt(t: { startedAt?: Date | null; heartbeatAt?: Date | null }, cutoffMs: number): boolean {
  const at = t.heartbeatAt ?? t.startedAt;
  return !at || new Date(at).getTime() < cutoffMs;
}

const TERMINAL = new Set(['DONE', 'FAILED', 'SKIPPED']);
const activeRuns = new Set<string>();

// ── process-wide limiter for model calls ─────────────────────────────────────
let inflightCalls = 0;
const waiters: Array<() => void> = [];
/** Wait for a model-call slot, but never forever: a timeout fails the attempt. */
async function acquire(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (inflightCalls >= swarmConfig().concurrency) {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error('acquire timeout');
    await new Promise<void>((resolve) => {
      const wake = () => { clearTimeout(t); resolve(); };
      const t = setTimeout(() => { const i = waiters.indexOf(wake); if (i >= 0) waiters.splice(i, 1); resolve(); }, left);
      waiters.push(wake);
    });
  }
  inflightCalls++;
}
function release(): void {
  inflightCalls--;
  waiters.shift()?.();
}

const sha = (s: string) => createHash('sha256').update(normalizeLearning(s).toLowerCase()).digest('hex');
const errCode = (e: unknown) => (e as { code?: string } | null)?.code;

/** Take the exclusive claim on a lane. Exactly one caller per (runId, lane) ever gets true. */
export async function claimLane(runId: string, userId: string, lane: string, taskId: string, owner: string): Promise<boolean> {
  try {
    await prisma.swarmClaim.create({ data: { runId, userId, lane, taskId, owner } });
    return true;
  } catch (e) {
    if (errCode(e) === 'P2002') return false;
    throw e;
  }
}

async function releaseClaim(runId: string, userId: string, lane: string, owner: string): Promise<void> {
  await prisma.swarmClaim.deleteMany({ where: { runId, userId, lane, owner } });
}

function providerOf(model: string): string {
  return model.startsWith('claude') ? 'anthropic' : model.startsWith('gemini') ? 'google' : 'openai-compatible';
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error('task timeout')), ms); })]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function executeTask(task: TaskRow, all: TaskRow[], owner: string): Promise<void> {
  const cfg = swarmConfig();
  const { runId, userId } = task;
  // Every write after the claim carries the owner, so a superseded engine's writes touch 0 rows.
  const own = { id: task.id, runId, userId, status: 'RUNNING', claimOwner: owner };
  const pending = { id: task.id, runId, userId, status: 'PENDING' };
  let claimed = false;
  let superseded = false;

  const kit = await getOrgKit();
  const agent = kit.agents.find((a) => a.agent_id === task.agentId);
  const byLane = new Map(all.map((t) => [t.lane, t]));
  const deps = task.dependsOn.map((l) => byLane.get(l)).filter((t): t is TaskRow => !!t);
  const depOutputs = deps.filter((d) => d.status === 'DONE').map((d) => ({ lane: d.lane, result: String((d.output as { result?: string } | null)?.result ?? '') }));
  const failedDeps = deps.filter((d) => d.status !== 'DONE').map((d) => d.lane);

  const finishFailed = async (error: string, attempts: number) => {
    const w = await prisma.swarmTask.updateMany({
      where: claimed ? own : pending,
      data: { status: 'FAILED', error: error.slice(0, 200), attempts, finishedAt: new Date() },
    });
    if (w.count !== 1) return; // superseded: the new owner reports
    await writeLedger({ userId, action: 'swarm_task_failed', tool: 'swarm_task', permissionClass: 'A', status: 'FAILED', initiator: 'system', persona: 'WHINK', correlationId: runId, metadata: { lane: task.lane, role: task.role, agentId: task.agentId, attempts } });
  };
  /** Claim the lane and start the clock. Only called once a model slot is held. */
  const claimAndStart = async (): Promise<boolean> => {
    if (!(await claimLane(runId, userId, task.lane, task.id, owner))) return false; // someone else owns this lane
    const moved = await prisma.swarmTask.updateMany({ where: pending, data: { status: 'RUNNING', claimOwner: owner, startedAt: new Date(), heartbeatAt: new Date() } });
    if (moved.count !== 1) { await releaseClaim(runId, userId, task.lane, owner); return false; }
    claimed = true;
    return true;
  };
  if (!agent) {
    if (await claimAndStart()) await finishFailed('agent not found in org-kit', task.attempts);
    return;
  }

  const learningRows = await prisma.swarmLearning.findMany({
    where: { runId, userId }, orderBy: { createdAt: 'desc' }, take: cfg.learningDigestMax, select: { text: true },
  });
  const learnings = learningRows.map((l: { text: string }) => l.text);
  const assigned: AssignedTask = {
    lane: task.lane, role: task.role as SwarmRole, title: task.title, objective: task.objective, deliverable: task.deliverable,
    requiredSkills: task.requiredSkills, covers: task.covers, dependsOn: task.dependsOn, estimatedCalls: task.estimatedCalls,
    agentId: task.agentId, agentName: agent.name, fit: task.fit as 'matched' | 'generalist',
  };

  let attempts = task.attempts;
  let lastError = 'failed';
  while (attempts < cfg.maxRetries + 1 && !superseded) {
    attempts++;
    let slot = false;
    let beat: ReturnType<typeof setInterval> | undefined;
    try {
      await acquire(cfg.acquireTimeoutMs);
      slot = true;
      // Claim and heartbeat start only now, so time spent waiting for a slot never makes a live task look stale.
      if (!claimed && !(await claimAndStart())) return;
      beat = setInterval(() => {
        void Promise.resolve(prisma.swarmTask.updateMany({ where: own, data: { heartbeatAt: new Date() } }))
          .then((r: { count: number }) => { if (r.count !== 1) superseded = true; })
          .catch(() => {});
      }, cfg.heartbeatMs);
      const res = await withTimeout(callAgent({ task: assigned, agent, deps: depOutputs, failedDeps, learnings }), cfg.taskTimeoutMs);
      account(userId, runId, res.tokensIn, res.tokensOut);
      if (superseded) return;
      const done = await prisma.swarmTask.updateMany({
        where: own,
        data: { status: 'DONE', output: res.output as object, attempts, tokensIn: res.tokensIn, tokensOut: res.tokensOut, finishedAt: new Date(), error: null },
      });
      if (done.count !== 1) return; // superseded: this result is discarded, nothing else is written
      for (const ev of res.securityEvents) {
        try { await logSecurityEvent(userId, ev, `run=${runId} lane=${task.lane} agent=${task.agentId}`, runId); } catch { /* ledger down: output is already sanitised */ }
      }
      for (const text of res.output.learnings) {
        try {
          await prisma.swarmLearning.create({ data: { runId, userId, agentId: task.agentId, lane: task.lane, text, sha256: sha(text), confidence: res.output.confidence } });
        } catch (e) { if (errCode(e) !== 'P2002') logger.warn('swarm learning write failed', { runId }); }
      }
      await writeLedger({ userId, action: 'swarm_task_done', tool: 'swarm_task', permissionClass: 'A', status: 'EXECUTED', initiator: 'system', persona: 'WHINK', correlationId: runId, metadata: { lane: task.lane, role: task.role, agentId: task.agentId, attempts, tokens: res.tokensIn + res.tokensOut, learnings: res.output.learnings.length } });
      return;
    } catch (e) {
      const t = e as { tokensIn?: number; tokensOut?: number; message?: string };
      if (t.tokensIn || t.tokensOut) account(userId, runId, t.tokensIn ?? 0, t.tokensOut ?? 0);
      lastError = t.message ?? 'failed';
      const w = await prisma.swarmTask.updateMany({ where: claimed ? own : pending, data: { attempts } });
      if (w.count !== 1) return; // superseded
    } finally {
      if (beat) clearInterval(beat);
      if (slot) release();
    }
    if (attempts < cfg.maxRetries + 1) await sleep(cfg.retryDelayMs);
  }
  if (!superseded) await finishFailed(lastError, attempts);
}

function account(userId: string, runId: string, tokensIn: number, tokensOut: number): void {
  const model = swarmModel();
  recordUsage({ userId, provider: providerOf(model), model, tokensIn, tokensOut, kind: 'other' });
  void Promise.resolve(prisma.swarmRun.updateMany({ where: { id: runId, userId }, data: { tokensUsed: { increment: tokensIn + tokensOut } } }))
    .catch(() => logger.warn('swarm token accounting failed', { runId }));
}

async function skipPending(runId: string, userId: string, reason: string, laneIds?: string[]): Promise<void> {
  await prisma.swarmTask.updateMany({
    where: { runId, userId, status: 'PENDING', ...(laneIds ? { id: { in: laneIds } } : {}) },
    data: { status: 'SKIPPED', error: reason, finishedAt: new Date() },
  });
}

/** Run one swarm to completion (or cancel / token cap), then finalise. Safe to call twice: the second call is a no-op. */
export async function runSwarm(runId: string, userId: string): Promise<'finished' | 'already_active'> {
  if (!userId) throw new Error('swarm: userId is required');
  if (activeRuns.has(runId)) return 'already_active';
  activeRuns.add(runId);
  const owner = randomUUID();
  const inflight = new Map<string, Promise<void>>();
  let lastBudgetCheck = 0;
  try {
    for (;;) {
      const run = await prisma.swarmRun.findFirst({ where: { id: runId, userId } });
      if (!run || run.status !== 'RUNNING') break;
      const tasks = (await prisma.swarmTask.findMany({ where: { runId, userId } })) as TaskRow[];
      let stopReason: string | null = run.cancelRequested ? 'cancelled' : run.tokensUsed >= run.tokenCap ? 'token_cap' : null;
      if (!stopReason && Date.now() - lastBudgetCheck >= swarmConfig().budgetCheckMs) {
        lastBudgetCheck = Date.now();
        try { if ((await budgetState(userId)).state === 'hard') stopReason = 'budget_hard_limit'; } catch { /* meter unavailable: the token cap still applies */ }
        if (stopReason) {
          await writeLedger({ userId, action: 'swarm_budget_stopped', tool: 'swarm', permissionClass: 'A', status: 'DENIED', initiator: 'system', persona: 'WHINK', correlationId: runId, metadata: { reason: 'budget_hard_limit', tokensUsed: run.tokensUsed } });
        }
      }
      if (stopReason) {
        await skipPending(runId, userId, stopReason);
        if (stopReason === 'token_cap' || stopReason === 'budget_hard_limit') await prisma.swarmRun.updateMany({ where: { id: runId, userId, stopReason: null }, data: { stopReason } });
        if (inflight.size === 0) break;
        await Promise.race(inflight.values());
        continue;
      }
      // A task running under another engine (another process) is not ours to skip. Wait for it, or
      // reclaim it when it has been silent longer than any task could legitimately run.
      const foreign = tasks.filter((t) => t.status === 'RUNNING' && !inflight.has(t.id));
      if (foreign.length > 0 && inflight.size === 0) {
        const cfg = swarmConfig();
        const cutoff = Date.now() - cfg.heartbeatStaleMs;
        const stale = foreign.filter((t) => staleAt(t as TaskRow & { startedAt?: Date | null; heartbeatAt?: Date | null }, cutoff));
        if (stale.length) {
          const ids = stale.map((t) => t.id);
          await prisma.swarmTask.updateMany({ where: { runId, userId, id: { in: ids }, status: 'RUNNING' }, data: { status: 'PENDING', claimOwner: null } });
          await prisma.swarmClaim.deleteMany({ where: { runId, userId, taskId: { in: ids } } });
        } else {
          await sleep(250);
        }
        continue;
      }
      const byLane = new Map(tasks.map((t) => [t.lane, t]));
      const ready: TaskRow[] = [];
      let progressed = false;
      for (const t of tasks) {
        if (t.status !== 'PENDING' || inflight.has(t.id)) continue;
        const deps = t.dependsOn.map((l) => byLane.get(l)).filter((d): d is TaskRow => !!d);
        if (deps.some((d) => !TERMINAL.has(d.status))) continue;
        if (deps.length > 0 && !deps.some((d) => d.status === 'DONE')) {
          await skipPending(runId, userId, 'all dependencies failed', [t.id]);
          progressed = true;
          continue;
        }
        ready.push(t);
      }
      const cap = swarmConfig().concurrency;
      for (const t of ready) {
        if (inflight.size >= cap) break;
        const p = executeTask(t, tasks, owner)
          .catch((e) => logger.error('swarm task crashed', { runId, lane: t.lane, error: (e as Error)?.message }))
          .finally(() => { inflight.delete(t.id); });
        inflight.set(t.id, p);
      }
      if (inflight.size > 0) { await Promise.race(inflight.values()); continue; }
      if (progressed) continue;
      // Nothing running, nothing ready: either done or stuck. Stuck tasks are skipped, never left hanging.
      const stuck = tasks.filter((t) => t.status === 'PENDING');
      if (stuck.length > 0) await skipPending(runId, userId, 'unschedulable');
      break;
    }
    await Promise.allSettled([...inflight.values()]);
    await finalizeRun(runId, userId);
    return 'finished';
  } finally {
    activeRuns.delete(runId);
  }
}

/** A run with no activity for this long (and no live task) is treated as orphaned by a dead engine. */
export const SWARM_STALE_AFTER_MS = swarmConfig().heartbeatStaleMs;

/**
 * Crash recovery for the 24/7 worker. Tasks left RUNNING by a dead engine go back to PENDING (their claims
 * are released), finished tasks are never re-run, FINALIZING runs finish finalising. Safe to call repeatedly
 * and from a different process than the engine: a run is only touched when it shows no recent activity
 * (no RUNNING task with a heartbeat within `staleAfterMs` and the run row itself not updated within it).
 * Pass `userId` to scope the scan to one account; without it this is a worker-level scan across accounts,
 * and every later operation is still scoped to the run's own userId.
 */
export async function resumeSwarms(opts: { userId?: string; staleAfterMs?: number; now?: Date } = {}): Promise<number> {
  const staleAfterMs = opts.staleAfterMs ?? SWARM_STALE_AFTER_MS;
  const cutoff = (opts.now ?? new Date()).getTime() - staleAfterMs;
  const scope = opts.userId ? { userId: opts.userId } : {};
  const runs = (await prisma.swarmRun.findMany({ where: { ...scope, status: { in: ['RUNNING', 'FINALIZING'] } }, select: { id: true, userId: true, status: true, updatedAt: true } })) as Array<{ id: string; userId: string; status: string; updatedAt?: Date | null }>;
  let n = 0;
  for (const r of runs) {
    if (activeRuns.has(r.id)) continue;
    const running = (await prisma.swarmTask.findMany({ where: { runId: r.id, userId: r.userId, status: 'RUNNING' }, select: { id: true, startedAt: true, heartbeatAt: true } })) as Array<{ id: string; startedAt?: Date | null; heartbeatAt?: Date | null }>;
    const isStale = (t: { startedAt?: Date | null; heartbeatAt?: Date | null }) => staleAt(t, cutoff);
    const stale = running.filter(isStale);
    if (running.length > stale.length) continue; // a task started recently: an engine is alive somewhere
    if (stale.length === 0 && r.updatedAt && r.updatedAt.getTime() >= cutoff) continue; // between tasks, run row active
    n++;
    if (r.status === 'FINALIZING') { void finalizeRun(r.id, r.userId, { resume: true }).catch(() => {}); continue; }
    if (stale.length) {
      const ids = stale.map((t) => t.id);
      await prisma.swarmTask.updateMany({ where: { runId: r.id, userId: r.userId, id: { in: ids }, status: 'RUNNING' }, data: { status: 'PENDING', claimOwner: null } });
      await prisma.swarmClaim.deleteMany({ where: { runId: r.id, userId: r.userId, taskId: { in: ids } } });
    }
    void runSwarm(r.id, r.userId).catch((e) => logger.error('swarm resume failed', { runId: r.id, error: (e as Error)?.message }));
  }
  return n;
}

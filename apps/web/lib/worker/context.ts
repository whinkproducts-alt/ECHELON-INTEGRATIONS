/**
 * Job context and the only write helpers a worker job may use.
 *
 * Rules enforced here, in code:
 *  - Jobs get no tool executor and no outbound capability. The only capabilities a job can ever
 *    exercise are in WORKER_CAPABILITIES, both Class A and verified not protected at call time.
 *  - Every memory or recommendation write goes through checkPermission, then the write, and the
 *    run is ledgered once through lib/ledger.ts with counts only (initiator system, persona WHINK).
 *  - Model calls go through the model router only, never with tools, and the text sent is untrusted-wrapped by the job.
 */
import { checkPermission } from '@/lib/permission-engine';
import { classifyProtected } from '@/lib/protected-actions';
import { recordActionSafe } from '@/lib/ledger';
import { writeMemory, type MemoryWriteInput } from '@/lib/memory-engine';
import { chatOnce, type ChatMessage } from '@/lib/model-router';
import { applyOfflineFallback } from '@/lib/offline';
import { recordUsage } from '@/lib/usage';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { RosterEntry } from '@/lib/worker/roster';

export const WORKER_CAPABILITIES = Object.freeze(['worker_memory_write', 'recommendation_write'] as const);
export type WorkerCapability = (typeof WORKER_CAPABILITIES)[number];

export const MEMORY_CONF_CAP = { news: 0.5, hypothesis: 0.4, brief: 0.4 } as const;

export interface Counters {
  memories: number; deduped: number; recommendations: number; dropped: number; denied: number;
  items: number; modelCalls: number; superseded: number; decayed: number; skipped: number;
}
export const newCounters = (): Counters => ({
  memories: 0, deduped: 0, recommendations: 0, dropped: 0, denied: 0, items: 0, modelCalls: 0, superseded: 0, decayed: 0, skipped: 0,
});

export interface JobContext {
  userId: string;
  correlationId: string;
  jobKey: string;
  jobType: string;
  /** Roster entry (null for system jobs). */
  entry: RosterEntry | null;
  params: Record<string, string>;
  now: Date;
  signal: AbortSignal;
  counters: Counters;
  /**
   * Always empty. Jobs are never handed tools; the type makes an attempt to add one a compile error
   * and the runner asserts it at runtime.
   */
  readonly tools: readonly never[];
}

export function makeContext(p: Omit<JobContext, 'counters' | 'tools' | 'now' | 'signal'> & { now?: Date; signal?: AbortSignal }): JobContext {
  return { ...p, now: p.now ?? new Date(), signal: p.signal ?? new AbortController().signal, counters: newCounters(), tools: [] };
}

/** Throws unless the capability is a worker capability and not protected. Called before every write. */
export function assertWorkerCapability(cap: string): asserts cap is WorkerCapability {
  if (!(WORKER_CAPABILITIES as readonly string[]).includes(cap)) throw new Error(`worker: capability ${cap} is not allowed`);
  if (classifyProtected({ toolName: cap, capability: cap }).protected) throw new Error(`worker: capability ${cap} is protected`);
}

export function assertNoTools(ctx: JobContext): void {
  if ((ctx.tools as readonly unknown[]).length !== 0) throw new Error('worker: jobs must not receive tools');
}

async function permit(ctx: JobContext, cap: WorkerCapability): Promise<boolean> {
  assertWorkerCapability(cap);
  const perm = await checkPermission(ctx.userId, cap, 'A', ctx.correlationId);
  if (perm.allowed) return true;
  ctx.counters.denied++;
  await recordActionSafe({
    userId: ctx.userId, initiator: 'system', persona: 'WHINK', tool: cap, action: 'worker_write_denied',
    permissionClass: 'A', status: 'DENIED', inputSummary: `job=${ctx.jobType}`, outputSummary: perm.reason ?? 'denied',
    correlationId: ctx.correlationId,
  });
  return false;
}

/** Permission-checked memory write. Confidence is capped by type; the memory firewall still applies on top. */
export async function workerWriteMemory(ctx: JobContext, input: Omit<MemoryWriteInput, 'userId'>, cap: number): Promise<{ id: string; deduped: boolean } | null> {
  if (!(await permit(ctx, 'worker_memory_write'))) return null;
  const res = await writeMemory({
    ...input,
    userId: ctx.userId,
    confidence: Math.min(input.confidence ?? cap, cap),
  });
  if (res.deduped) ctx.counters.deduped++; else ctx.counters.memories++;
  return res;
}

/** Permission gate for maintenance writes that change existing memory rows (curation). */
export async function workerMemoryGate(ctx: JobContext): Promise<boolean> {
  return permit(ctx, 'worker_memory_write');
}

export interface RecommendationInput {
  source: string; kind: string; title: string; body: string; link?: string | null;
  severity?: 'info' | 'warning' | 'critical'; dedupeKey?: string;
}

/** Permission-checked recommendation write. Returns false when it already exists (same dedupeKey) or is denied. */
export async function workerWriteRecommendation(ctx: JobContext, r: RecommendationInput): Promise<boolean> {
  if (r.link && !r.link.startsWith('/')) throw new Error('worker: recommendation links must be internal paths');
  if (!(await permit(ctx, 'recommendation_write'))) return false;
  try {
    await prisma.recommendation.create({
      data: {
        userId: ctx.userId,
        source: r.source.slice(0, 120),
        kind: r.kind.slice(0, 60),
        title: r.title.slice(0, 200),
        body: r.body.slice(0, 6000),
        link: r.link ?? null,
        severity: r.severity ?? 'info',
        dedupeKey: r.dedupeKey ?? null,
      },
    });
    ctx.counters.recommendations++;
    return true;
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') return false; // already recommended
    throw e;
  }
}

export function tierModel(tier: 'fast' | 'standard' | 'deep'): string | undefined {
  const v = process.env[`WORKER_MODEL_${tier.toUpperCase()}`]?.trim();
  return v || undefined;
}

const approxTokens = (s: string) => Math.ceil(s.length / 4);

/** Input character budget for a run, derived from maxTokensPerRun (40% reserved for output). */
export function inputCharBudget(maxTokensPerRun: number): number {
  return Math.floor(maxTokensPerRun * 0.6) * 4;
}

/** One model call through the router. No tools. Honours the offline/budget local fallback. */
export async function workerAsk(ctx: JobContext, messages: ChatMessage[]): Promise<string> {
  assertNoTools(ctx);
  const tier = ctx.entry?.modelTier ?? 'fast';
  const maxTokens = Math.max(200, Math.floor((ctx.entry?.maxTokensPerRun ?? 2000) * 0.4));
  let model = tierModel(tier);
  let baseUrl: string | undefined;
  if (model) {
    const fb = await applyOfflineFallback({ userId: ctx.userId, model, persona: 'WHINK', correlationId: ctx.correlationId });
    model = fb.model; baseUrl = fb.baseUrl;
  }
  ctx.counters.modelCalls++;
  const out = await chatOnce({ messages, model, maxTokens, temperature: 0.2, baseUrl });
  recordUsage({
    userId: ctx.userId, provider: 'worker', model: model ?? process.env.DEFAULT_MODEL ?? 'default',
    tokensIn: approxTokens(messages.map((m) => m.content).join('\n')), tokensOut: approxTokens(out), kind: 'other',
  });
  return out;
}

/** One ledger row per run: counts only, never content. */
export async function ledgerRun(ctx: JobContext, status: 'EXECUTED' | 'FAILED' | 'VALIDATED', started: number, note?: string): Promise<void> {
  const c = ctx.counters;
  await recordActionSafe({
    userId: ctx.userId, initiator: 'system', persona: 'WHINK', action: 'worker_job_run',
    permissionClass: 'A', status,
    inputSummary: `job=${ctx.jobKey} memories=${c.memories} deduped=${c.deduped} recommendations=${c.recommendations} dropped=${c.dropped} denied=${c.denied} items=${c.items} modelCalls=${c.modelCalls} superseded=${c.superseded} decayed=${c.decayed}`,
    outputSummary: note,
    correlationId: ctx.correlationId, latencyMs: Date.now() - started,
  });
}

export async function ledgerSecurity(ctx: JobContext, event: string, count: number): Promise<void> {
  logger.security(event, { userId: ctx.userId, count });
  await recordActionSafe({
    userId: ctx.userId, initiator: 'system', persona: 'WHINK', action: `SECURITY_EVENT: ${event}`,
    permissionClass: 'C', status: 'DENIED', inputSummary: `job=${ctx.jobType} count=${count}`, correlationId: ctx.correlationId,
  });
}

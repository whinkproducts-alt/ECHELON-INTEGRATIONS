/**
 * Account-scoped inference admission.
 *
 * A provider key, a saved model, or a missing price is not permission to spend.
 * Paid dispatch stays blocked unless the operator flag is on, the price is known,
 * and a positive monthly micro-USD cap is set. Unknown price is not zero.
 * Local EAR byte holds in reservations.ts stay a separate accounting rule.
 *
 * Network calls happen only after this transaction commits. Reconciliation never
 * retries the external call. Open holds remain liabilities across the UTC month.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { estimateCostMicros } from '@/lib/usage';
import { isLocalOnlyMode } from '@/lib/local-only';
import { paidAdmission } from '@/lib/model-router/priority';
import { getSafetyState } from '@/lib/safety/lockdown';

export class DispatchBlockedError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'DispatchBlockedError';
    this.code = code;
  }
}

export type DispatchPurpose =
  | 'chat' | 'tool_round' | 'embed' | 'voice_stt' | 'voice_tts'
  | 'worker' | 'skill' | 'swarm' | 'memory' | 'refinement' | 'other';

export type CostClass = 'local' | 'metered' | 'trial' | 'unknown';

export interface AdmissionDecisionInput {
  userId: string;
  costClass: CostClass;
  priceKnown: boolean;
  /** Operator flag only. A BYOK key must not be passed here as true. */
  paidAdmitted: boolean;
  /** null or <= 0 means no paid authority, never an unlimited cap. */
  spendCapMicros: number | null;
  reservedTokens: number;
  reservedMicros: number;
  tokenUsed: number;
  tokenReserved: number;
  tokenLimit: number | null;
  tokenHardPct: number;
  spendUsedMicros: number;
  spendReservedMicros: number;
  lockedDown: boolean;
  localOnly: boolean;
}

const ATTEMPT_KEY = /^[A-Za-z0-9:_-]{8,80}$/;
const OPEN = ['reserved', 'held'] as const;

/** UTC calendar month start, computed here so admission does not depend on budget module wiring. */
function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Same local-host rule as the router, kept here so a mocked router cannot drop the check. */
export function endpointIsLocal(raw: string): boolean {
  let host: string;
  try { host = new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (host === 'localhost' || host === '::1' || host === 'host.docker.internal' || host.endsWith('.local')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function spendCapMicros(env: NodeJS.ProcessEnv = process.env): number | null {
  const n = Number.parseInt(env.WHINK_MONTHLY_SPEND_MICROS ?? '', 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function classifyCost(input: { model: string; baseUrl?: string; env?: NodeJS.ProcessEnv }): CostClass {
  const model = input.model.trim();
  const lower = model.toLowerCase();
  const env = input.env ?? process.env;
  if (!model) return 'unknown';
  if (lower.startsWith('nvidia/') || lower.includes('nemotron')) return 'trial';
  if (/^(claude|gemini|gpt-|o1|o3|o4)/.test(lower)) return 'metered';
  const base = input.baseUrl ?? env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://localhost:11434/v1';
  return endpointIsLocal(base) ? 'local' : 'unknown';
}

export function classifyVoice(input: { channel: 'stt' | 'tts'; env?: NodeJS.ProcessEnv }): CostClass {
  const env = input.env ?? process.env;
  const provider = ((input.channel === 'stt' ? env.STT_PROVIDER : env.TTS_PROVIDER) ?? '').toLowerCase().trim();
  if (provider === 'openai' || provider === 'deepgram') return 'metered';
  const url = (input.channel === 'stt' ? env.STT_URL : env.TTS_URL)?.trim();
  if (!url) return 'unknown';
  return endpointIsLocal(url) ? 'local' : 'unknown';
}

export function voicePriceKnown(env: NodeJS.ProcessEnv = process.env): { known: boolean; micros: number } {
  const n = Number.parseInt(env.WHINK_VOICE_MICROS_PER_REQUEST ?? '', 10);
  if (!Number.isSafeInteger(n) || n < 0) return { known: false, micros: 0 };
  return { known: true, micros: n };
}

export function embeddingCostClass(env: NodeJS.ProcessEnv = process.env): 'local' | 'unknown' {
  if ((env.EMBEDDING_MODEL ?? '').startsWith('openai/')) return 'unknown';
  const url = env.EMBEDDINGS_URL?.trim();
  if (url && !endpointIsLocal(url)) return 'unknown';
  const ollama = env.OLLAMA_URL?.trim();
  if (!url && ollama && !endpointIsLocal(ollama) && (env.EMBEDDING_MODEL ?? '').startsWith('ollama/')) return 'unknown';
  return 'local';
}

/** Conservative bound. Overflow is a refusal, not a smaller hold. */
export function conservativeTokens(inputChars: number, maxTokens: number): number {
  if (!Number.isFinite(inputChars) || inputChars < 0 || inputChars > 8_000_000_000) throw new DispatchBlockedError('INVALID_BOUND');
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 2_000_000_000) throw new DispatchBlockedError('INVALID_BOUND');
  const total = Math.ceil(inputChars / 4) + maxTokens;
  if (!Number.isSafeInteger(total) || total <= 0 || total > 2_000_000_000) throw new DispatchBlockedError('INVALID_BOUND');
  return total;
}

export function decideAdmission(input: AdmissionDecisionInput): { ok: true } | { ok: false; code: string } {
  if (!input.userId) return { ok: false, code: 'MISSING_ACCOUNT' };
  if (input.lockedDown && input.costClass !== 'local') return { ok: false, code: 'LOCKDOWN' };
  if (input.localOnly && input.costClass !== 'local') return { ok: false, code: 'LOCAL_ONLY' };
  if (input.costClass === 'trial') return { ok: false, code: 'TRIAL_NOT_ADMITTED' };
  if (input.costClass === 'unknown') return { ok: false, code: 'UNKNOWN_COST' };
  if (input.costClass === 'metered') {
    if (!input.paidAdmitted) return { ok: false, code: 'PAID_NOT_ADMITTED' };
    if (!input.priceKnown) return { ok: false, code: 'UNKNOWN_PRICE' };
    if (input.spendCapMicros == null || input.spendCapMicros <= 0) return { ok: false, code: 'SPEND_CAP_UNSET' };
    if (input.spendUsedMicros + input.spendReservedMicros + input.reservedMicros > input.spendCapMicros) return { ok: false, code: 'SPEND_HARD_LIMIT' };
  }
  if (input.tokenLimit != null && input.tokenUsed + input.tokenReserved + input.reservedTokens > Math.floor(input.tokenLimit * input.tokenHardPct / 100)) {
    return { ok: false, code: 'TOKEN_HARD_LIMIT' };
  }
  return { ok: true };
}

/** Open holds have no createdAt filter: a crash must not erase last month's liability. */
export function openHoldWhere(userId: string) {
  return { userId, state: { in: [...OPEN] } };
}

export function preTransportFailure(e: unknown): boolean {
  const name = (e as Error)?.name ?? '';
  const msg = String((e as Error)?.message ?? e ?? '');
  return name === 'LocalOnlyViolationError' || name === 'DispatchBlockedError' || /not set|DISPATCH_REQUIRED|INVALID_BOUND/.test(msg);
}

export function uncertaintyOf(e: unknown): string {
  const name = (e as Error)?.name ?? '';
  const msg = String((e as Error)?.message ?? e ?? '');
  if (name === 'AbortError' || /cancel/i.test(msg)) return 'cancelled';
  if (name === 'TimeoutError' || /timed? ?out/i.test(msg)) return 'timeout';
  return 'lost_response';
}

type AdmissionDb = {
  usageEvent: {
    aggregate: (args: unknown) => Promise<{ _sum: { tokensIn?: number | null; tokensOut?: number | null; costMicros?: number | null; reservedTokens?: number | null; reservedMicros?: number | null } }>;
    findFirst: (args: unknown) => Promise<{ id: string; state?: string } | null>;
    findMany: (args: unknown) => Promise<Array<{ reservedTokens: number; reservedMicros: number; periodStart: Date | null; createdAt: Date; state: string; uncertainty: string | null }>>;
    create: (args: unknown) => Promise<{ id: string }>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  userPreference: { findUnique: (args: unknown) => Promise<{ monthlyTokenBudget: bigint | number | null; budgetHardPct: number | null } | null> };
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ id: string }>>;
  $transaction: (fn: (tx: AdmissionDb) => Promise<{ id: string }>, opts?: unknown) => Promise<{ id: string }>;
};

async function liability(userId: string, now: Date, db: Pick<AdmissionDb, 'usageEvent'>) {
  const start = monthStart(now);
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const settled = await db.usageEvent.aggregate({
    where: { userId, createdAt: { gte: start, lt: resetsAt }, state: { notIn: [...OPEN] } },
    _sum: { tokensIn: true, tokensOut: true, costMicros: true },
  });
  const open = await db.usageEvent.aggregate({
    where: openHoldWhere(userId),
    _sum: { reservedTokens: true, reservedMicros: true },
  });
  const legacy = await db.usageEvent.aggregate({
    where: { userId, usageBasis: 'reserved', reservedTokens: { gt: 0 }, state: { notIn: ['reserved', 'held', 'settled', 'released'] } },
    _sum: { reservedTokens: true },
  });
  const settledSum = settled?._sum ?? {};
  const openSum = open?._sum ?? {};
  const legacySum = legacy?._sum ?? {};
  return {
    tokenUsed: (settledSum.tokensIn ?? 0) + (settledSum.tokensOut ?? 0),
    tokenReserved: (openSum.reservedTokens ?? 0) + (legacySum.reservedTokens ?? 0),
    spendUsedMicros: settledSum.costMicros ?? 0,
    spendReservedMicros: openSum.reservedMicros ?? 0,
  };
}

export interface ReserveInput {
  userId: string;
  purpose: DispatchPurpose;
  attemptKey?: string;
  correlationId?: string;
  model: string;
  provider?: string;
  baseUrl?: string;
  hasByok?: boolean;
  maxTokens: number;
  inputChars: number;
  kind?: string;
  reservedTokens?: number;
  reservedMicros?: number;
  priceKnown?: boolean;
  costClass?: CostClass;
}

export interface AdmissionDeps {
  db?: AdmissionDb;
  readSafety?: (userId: string) => Promise<{ lockedDown: boolean }>;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

export async function reserveDispatch(input: ReserveInput, deps: AdmissionDeps = {}) {
  const db = (deps.db ?? prisma) as AdmissionDb;
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  if (!input.userId) throw new DispatchBlockedError('MISSING_ACCOUNT');
  const attemptKey = input.attemptKey ?? randomUUID();
  if (!ATTEMPT_KEY.test(attemptKey)) throw new DispatchBlockedError('INVALID_BOUND');
  const costClass = input.costClass ?? classifyCost({ model: input.model, baseUrl: input.baseUrl, env });
  const tokens = input.reservedTokens ?? conservativeTokens(input.inputChars, input.maxTokens);
  let priceKnown = input.priceKnown ?? false;
  let reservedMicros = input.reservedMicros ?? 0;
  if (costClass === 'metered' && input.reservedMicros == null) {
    const priced = estimateCostMicros(input.model, tokens, 0, env.WHINK_MODEL_PRICES);
    priceKnown = priced != null;
    reservedMicros = priced ?? 0;
  }
  if (!Number.isSafeInteger(reservedMicros) || reservedMicros < 0) throw new DispatchBlockedError('INVALID_BOUND');
  const safety = await (deps.readSafety ?? getSafetyState)(input.userId);
  let created: { id: string };
  try {
    created = await db.$transaction(async (tx: AdmissionDb) => {
      const rows = await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`;
      if (rows.length !== 1) throw new DispatchBlockedError('MISSING_ACCOUNT');
      const existing = await tx.usageEvent.findFirst({ where: { userId: input.userId, attemptKey }, select: { id: true, state: true } });
      if (existing) throw new DispatchBlockedError('ATTEMPT_CONSUMED');
      const pref = await tx.userPreference.findUnique({ where: { userId: input.userId }, select: { monthlyTokenBudget: true, budgetHardPct: true } });
      const cap = Number.parseInt(env.WHINK_MONTHLY_TOKEN_BUDGET ?? '', 10);
      const operatorCap = Number.isFinite(cap) && cap > 0 ? cap : 0;
      const userLimit = pref?.monthlyTokenBudget == null ? null : Number(pref.monthlyTokenBudget);
      const tokenLimit = operatorCap > 0 ? (userLimit && userLimit > 0 ? Math.min(userLimit, operatorCap) : operatorCap) : (userLimit && userLimit > 0 ? userLimit : null);
      const hardCeiling = Number.parseInt(env.WHINK_BUDGET_HARD_PCT ?? '', 10);
      const ceiling = Number.isFinite(hardCeiling) && hardCeiling > 0 ? hardCeiling : 100;
      const tokenHardPct = Math.min(pref?.budgetHardPct ?? ceiling, ceiling);
      const owed = await liability(input.userId, now, tx);
      const decision = decideAdmission({
        userId: input.userId,
        costClass,
        priceKnown,
        paidAdmitted: paidAdmission(env)(),
        spendCapMicros: spendCapMicros(env),
        reservedTokens: tokens,
        reservedMicros,
        tokenUsed: owed.tokenUsed,
        tokenReserved: owed.tokenReserved,
        tokenLimit,
        tokenHardPct,
        spendUsedMicros: owed.spendUsedMicros,
        spendReservedMicros: owed.spendReservedMicros,
        lockedDown: safety.lockedDown,
        localOnly: isLocalOnlyMode(env),
      });
      if (!decision.ok) throw new DispatchBlockedError(decision.code);
      return tx.usageEvent.create({
        data: {
          userId: input.userId,
          provider: (input.provider ?? costClass).slice(0, 40),
          model: input.model.slice(0, 100),
          kind: input.kind ?? 'other',
          usageBasis: 'reserved',
          reservedTokens: tokens,
          reservedMicros,
          attemptKey,
          purpose: input.purpose,
          state: 'reserved',
          costClass,
          priceKnown,
          currency: 'USD',
          periodStart: monthStart(now),
          createdAt: now,
        },
      });
    }, { isolationLevel: 'ReadCommitted' });
  } catch (e) {
    if (e instanceof DispatchBlockedError) throw e;
    throw new DispatchBlockedError('DB_FAILURE');
  }
  return { id: created.id, attemptKey, userId: input.userId, reservedTokens: tokens, reservedMicros, costClass, priceKnown };
}

async function transition(userId: string, attemptKey: string, from: string, data: Record<string, unknown>, db: Pick<AdmissionDb, 'usageEvent'>) {
  const result = await db.usageEvent.updateMany({ where: { userId, attemptKey, state: from }, data });
  if (result.count !== 1) throw new DispatchBlockedError('ATTEMPT_CONSUMED');
}

export async function settleDispatch(input: {
  userId: string;
  attemptKey: string;
  tokensIn: number;
  tokensOut: number;
  basis: 'estimated' | 'provider';
  model?: string;
}, deps: AdmissionDeps = {}) {
  const db = (deps.db ?? prisma) as AdmissionDb;
  if (![input.tokensIn, input.tokensOut].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 2_000_000_000)) throw new DispatchBlockedError('INVALID_BOUND');
  const costMicros = input.model ? estimateCostMicros(input.model, input.tokensIn, input.tokensOut, (deps.env ?? process.env).WHINK_MODEL_PRICES) : null;
  try {
    await transition(input.userId, input.attemptKey, 'reserved', {
      state: 'settled',
      usageBasis: input.basis,
      reservedTokens: 0,
      reservedMicros: 0,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costMicros,
      estimatedMicros: input.basis === 'estimated' ? costMicros : null,
      priceKnown: costMicros != null,
      settledAt: deps.now ?? new Date(),
      uncertainty: null,
    }, db);
  } catch (e) {
    if (e instanceof DispatchBlockedError) throw e;
    throw new DispatchBlockedError('DB_FAILURE');
  }
}

export async function holdDispatch(input: { userId: string; attemptKey: string; uncertainty: string }, deps: AdmissionDeps = {}) {
  const db = (deps.db ?? prisma) as AdmissionDb;
  try {
    await transition(input.userId, input.attemptKey, 'reserved', {
      state: 'held',
      usageBasis: 'held',
      uncertainty: input.uncertainty.slice(0, 40),
    }, db);
  } catch (e) {
    if (e instanceof DispatchBlockedError) throw e;
    throw new DispatchBlockedError('DB_FAILURE');
  }
}

/** Release only when the caller proves no external attempt started. Never retries that attempt. */
export async function releaseDispatch(input: { userId: string; attemptKey: string; externalAttemptStarted: false }, deps: AdmissionDeps = {}) {
  if (input.externalAttemptStarted !== false) throw new DispatchBlockedError('ATTEMPT_CONSUMED');
  const db = (deps.db ?? prisma) as AdmissionDb;
  try {
    await transition(input.userId, input.attemptKey, 'reserved', {
      state: 'released',
      usageBasis: 'released',
      reservedTokens: 0,
      reservedMicros: 0,
      uncertainty: 'not_sent',
    }, db);
  } catch (e) {
    if (e instanceof DispatchBlockedError) throw e;
    throw new DispatchBlockedError('DB_FAILURE');
  }
}

/** Idempotent read. Does not call a provider and does not clear a hold whose send status is unknown. */
export async function reconcileDispatch(userId: string, now = new Date(), deps: AdmissionDeps = {}) {
  if (!userId) throw new DispatchBlockedError('MISSING_ACCOUNT');
  const db = (deps.db ?? prisma) as AdmissionDb;
  const rows = await db.usageEvent.findMany({
    where: openHoldWhere(userId),
    select: { reservedTokens: true, reservedMicros: true, periodStart: true, createdAt: true, state: true, uncertainty: true },
  });
  const start = monthStart(now);
  return {
    outstanding: rows.length,
    priorMonth: rows.filter((r) => (r.periodStart ?? r.createdAt) < start).length,
    reservedTokens: rows.reduce((n, r) => n + r.reservedTokens, 0),
    reservedMicros: rows.reduce((n, r) => n + r.reservedMicros, 0),
    retried: 0,
  };
}

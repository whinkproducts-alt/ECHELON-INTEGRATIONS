/**
 * R04 model priority: saved first/second/third choices, per-request eligibility, and bounded fallback.
 *
 * For each request, in this order: lockdown and Local-Only; data class against each entry's ceiling; tool
 * support; trial admission; spend admission; credential presence; recent health. The first eligible entry in
 * the Founder's order is used. A manual-handoff entry pauses automatic fallback visibly: nothing after it is
 * tried without the Founder choosing to continue.
 *
 * Fallback applies to read-only inference only. A request that already caused an external action is never
 * replayed because the model changed (callers pass only pure inference to runWithFallback).
 */
import { prisma } from '@/lib/db';
import { recordActionSafe } from '@/lib/ledger';
import { entryConfigured, localDefaultModel, modelRegistry, type DataCeiling, type ModelRegistryEntry } from './registry';

type EnvMap = Record<string, string | undefined>;

export const MAX_CHOICES = 3;
export const DEFAULT_PROFILE_CHOICES = ['local-default'];

export type SkipReason =
  | 'unknown_entry' | 'lockdown' | 'local_only' | 'data_class' | 'tools_unsupported' | 'trial_evaluation_only'
  | 'paid_not_admitted' | 'not_configured' | 'cooldown' | 'credential_rejected';

export interface RouteContext {
  lockedDown: boolean;
  localOnly: boolean;
  dataClass: DataCeiling;
  needsTools: boolean;
  /** Spend admission for a metered entry: operator admitted paid models, or the user pays with their own key. */
  paidAdmitted: (e: ModelRegistryEntry) => boolean;
  env?: EnvMap;
  now?: number;
}

export type RouteStep = { type: 'auto'; entry: ModelRegistryEntry } | { type: 'handoff'; entry: ModelRegistryEntry };
export interface RoutePlan { steps: RouteStep[]; skipped: Array<{ id: string; reason: SkipReason }> }

// ── Choices validation ───────────────────────────────────────────────────────

export function validateChoices(raw: unknown, env: EnvMap = process.env): { ok: true; choices: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_CHOICES) return { ok: false, error: `Choose between 1 and ${MAX_CHOICES} models` };
  const ids = new Set(modelRegistry(env).map((e) => e.id));
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || !ids.has(v)) return { ok: false, error: 'Unknown model choice' };
    if (out.includes(v)) return { ok: false, error: 'The same model cannot be chosen twice' };
    out.push(v);
  }
  return { ok: true, choices: out };
}

// ── Health (per process) ─────────────────────────────────────────────────────
// 401/403 disables an entry until restart or correction; 402/429 cools down; timeout opens a short circuit.

const health = new Map<string, { until: number; reason: SkipReason }>();
export const COOLDOWN_MS = { credential: 60 * 60_000, quota: 5 * 60_000, timeout: 60_000 } as const;

export function classifyFailure(e: unknown): 'credential' | 'quota' | 'timeout' | 'other' {
  const msg = String((e as Error)?.message ?? e ?? '');
  const name = (e as Error)?.name ?? '';
  if (/\b(401|403)\b|not set|invalid api key|unauthori[sz]ed/i.test(msg)) return 'credential';
  if (/\b(402|429)\b|rate.?limit|quota|insufficient/i.test(msg)) return 'quota';
  if (name === 'AbortError' || name === 'TimeoutError' || /timed? ?out/i.test(msg)) return 'timeout';
  return 'other';
}

export function markFailure(id: string, kind: ReturnType<typeof classifyFailure>, now = Date.now()): void {
  if (kind === 'other') return;
  health.set(id, { until: now + COOLDOWN_MS[kind], reason: kind === 'credential' ? 'credential_rejected' : 'cooldown' });
}

export function healthOf(id: string, now = Date.now()): SkipReason | null {
  const h = health.get(id);
  if (!h) return null;
  if (h.until <= now) { health.delete(id); return null; }
  return h.reason;
}

export function __resetModelHealth(): void { health.clear(); }

// ── Planning (pure apart from the health map) ────────────────────────────────

const CEILING_RANK: Record<DataCeiling, number> = { synthetic: 0, internal: 1, private: 2 };

export function planRoute(choices: readonly string[], ctx: RouteContext): RoutePlan {
  const env = ctx.env ?? process.env;
  const registry = new Map(modelRegistry(env).map((e) => [e.id, e]));
  const steps: RouteStep[] = [];
  const skipped: RoutePlan['skipped'] = [];
  for (const id of choices) {
    const e = registry.get(id);
    if (!e) { skipped.push({ id, reason: 'unknown_entry' }); continue; }
    const reason = skipReasonFor(e, ctx, env);
    if (reason) { skipped.push({ id, reason }); continue; }
    if (e.kind === 'manual_handoff') { steps.push({ type: 'handoff', entry: e }); break; }
    steps.push({ type: 'auto', entry: e });
  }
  return { steps, skipped };
}

function skipReasonFor(e: ModelRegistryEntry, ctx: RouteContext, env: EnvMap): SkipReason | null {
  // Lockdown and Local-Only allow only models on this machine. A manual handoff is outbound too.
  if (!e.local && ctx.lockedDown) return 'lockdown';
  if (!e.local && ctx.localOnly) return 'local_only';
  if (CEILING_RANK[ctx.dataClass] > CEILING_RANK[e.dataCeiling]) return 'data_class';
  if (ctx.needsTools && !e.capabilities.tools && e.kind === 'api') return 'tools_unsupported';
  if (!e.admitted) return 'trial_evaluation_only';
  if (e.cost === 'metered' && !ctx.paidAdmitted(e)) return 'paid_not_admitted';
  if (!entryConfigured(e, env)) return 'not_configured';
  return healthOf(e.id, ctx.now);
}

// ── Bounded fallback for read-only inference ─────────────────────────────────

export type FallbackResult<T> =
  | { status: 'ok'; value: T; used: ModelRegistryEntry; attempts: Array<{ id: string; error?: string }> }
  | { status: 'handoff'; entry: ModelRegistryEntry; attempts: Array<{ id: string; error?: string }> }
  | { status: 'blocked'; reason: string; attempts: Array<{ id: string; error?: string }> };

/**
 * Try each automatic step in order within a total deadline. Stops at a manual handoff. The invoke function
 * must be read-only inference: no tools, no external side effect.
 */
export async function runWithFallback<T>(
  plan: RoutePlan,
  invoke: (entry: ModelRegistryEntry, signal: AbortSignal) => Promise<T>,
  opts: { totalBudgetMs?: number; now?: () => number } = {},
): Promise<FallbackResult<T>> {
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.totalBudgetMs ?? 120_000);
  const attempts: Array<{ id: string; error?: string }> = [];
  for (const step of plan.steps) {
    if (step.type === 'handoff') return { status: 'handoff', entry: step.entry, attempts };
    const left = deadline - now();
    if (left <= 0) return { status: 'blocked', reason: 'time budget used up', attempts };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), Math.min(left, step.entry.timeoutMs || left));
    try {
      const value = await invoke(step.entry, ac.signal);
      attempts.push({ id: step.entry.id });
      return { status: 'ok', value, used: step.entry, attempts };
    } catch (e) {
      const kind = ac.signal.aborted ? 'timeout' : classifyFailure(e);
      markFailure(step.entry.id, kind);
      attempts.push({ id: step.entry.id, error: kind });
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: 'blocked', reason: plan.steps.length ? 'every eligible model failed' : 'no eligible model', attempts };
}

// ── Profiles (database) ──────────────────────────────────────────────────────

export interface ProfileView { id: string; name: string; choices: string[]; revision: number; active: boolean; updatedAt: string }

const view = (r: { id: string; name: string; choices: string[]; revision: number; active: boolean; updatedAt: Date }): ProfileView =>
  ({ id: r.id, name: r.name, choices: r.choices, revision: r.revision, active: r.active, updatedAt: r.updatedAt.toISOString() });

export async function listProfiles(userId: string): Promise<ProfileView[]> {
  const rows = await prisma.modelRoutingProfile.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  return rows.map(view);
}

export async function activeProfile(userId: string): Promise<ProfileView | null> {
  const r = await prisma.modelRoutingProfile.findFirst({ where: { userId, active: true } });
  return r ? view(r) : null;
}

const NAME = /^[\p{L}\p{N} ._-]{1,40}$/u;

export async function saveProfile(userId: string, input: { name: unknown; choices: unknown; activate?: boolean }): Promise<{ ok: true; profile: ProfileView } | { ok: false; status: number; error: string }> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!NAME.test(name)) return { ok: false, status: 400, error: 'Profile name: 1 to 40 letters, numbers, spaces, dot, dash or underscore' };
  const v = validateChoices(input.choices);
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  const profile = await prisma.$transaction(async (tx) => {
    if (input.activate) await tx.modelRoutingProfile.updateMany({ where: { userId, active: true, NOT: { name } }, data: { active: false } });
    const row = await tx.modelRoutingProfile.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name, choices: v.choices, active: input.activate === true },
      update: { choices: v.choices, revision: { increment: 1 }, ...(input.activate ? { active: true } : {}) },
    });
    return view(row);
  });
  await recordActionSafe({
    userId, initiator: 'user', persona: 'WHINK', action: 'model_profile_saved', tool: 'model_priority', permissionClass: 'A',
    status: 'EXECUTED', inputSummary: `profile=${profile.id} rev=${profile.revision} choices=${profile.choices.join('>')}${profile.active ? ' active' : ''}`,
    correlationId: `model-profile-${profile.id}`,
  });
  return { ok: true, profile };
}

export async function activateProfile(userId: string, id: string): Promise<{ ok: true; profile: ProfileView } | { ok: false; status: number; error: string }> {
  const res = await prisma.$transaction(async (tx) => {
    const target = await tx.modelRoutingProfile.findFirst({ where: { id, userId } });
    if (!target) return null;
    await tx.modelRoutingProfile.updateMany({ where: { userId, active: true, NOT: { id } }, data: { active: false } });
    const row = await tx.modelRoutingProfile.update({ where: { id: target.id }, data: { active: true } });
    return view(row);
  });
  if (!res) return { ok: false, status: 404, error: 'Profile not found' };
  await recordActionSafe({
    userId, initiator: 'user', persona: 'WHINK', action: 'model_profile_activated', tool: 'model_priority', permissionClass: 'A',
    status: 'EXECUTED', inputSummary: `profile=${res.id} rev=${res.revision} choices=${res.choices.join('>')}`, correlationId: `model-profile-${res.id}`,
  });
  return { ok: true, profile: res };
}

export async function deleteProfile(userId: string, id: string): Promise<boolean> {
  const r = await prisma.modelRoutingProfile.deleteMany({ where: { id, userId } });
  return r.count === 1;
}

/** Deployment eligibility only. Keys authenticate a provider; they never authorize charges. */
export function paidAdmission(env: EnvMap = process.env) {
  const enabled = env.WHINK_PAID_MODELS_ENABLED === 'true';
  return () => enabled;
}

export function localFallbackModel(env: EnvMap = process.env): string {
  return localDefaultModel(env);
}

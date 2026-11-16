/**
 * Standing grants: R4 agent-tier, R5 learned, R8 template and R9 global-window approvals (lane G1a).
 *
 * Hard limits, enforced here and tested:
 * - OFF by default. Nothing below does anything unless ECHELON_STANDING_GRANTS=on (item 70).
 * - Consulted only for Class B. Class C and protected actions (money, proprietary data) never read these grants.
 * - A grant never changes an action's class. It only answers "may this Class B call run now". Creating one over
 *   a tool whose registered class is not B is refused, so a grant can tighten but never loosen.
 * - Only the owner, with a fresh passkey check, can create one. No agent or tool can.
 * - Founder-private and kill-team scopes are never covered. Lockdown ends every global window at once.
 * - Every creation, use and revocation is ledgered with the grant id.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { recordAction, recordActionSafe } from '@/lib/ledger';
import { approvalContentHash, toolArgsHash } from '@/lib/canonical-json';
import { classifyProtected } from '@/lib/protected-actions';
import { createApproval, decide, type ApprovalView, type DecisionOutcome } from '@/lib/approvals';
import { SECRET_RULES } from '@/lib/secret-scan';
import { isLockedDown, getSafetyState } from '@/lib/safety/lockdown';

export type GrantKind = 'agent_tier' | 'learned' | 'template' | 'global';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const MAX_GLOBAL_MS = 24 * HOUR;
export const MAX_GRANT_MS = 30 * DAY;
export const LEARNED_THRESHOLD = 5;
export const MAX_BATCH = 20;
const PASSKEY_FRESH_MS = 5 * 60_000;

/** The switch (item 70). Stays off until sandbox and pairing wiring (items 58, 59, 67, 68) are connected. */
export function standingGrantsEnabled(): boolean {
  return process.env.ECHELON_STANDING_GRANTS === 'on';
}

/** Only the owner's signed-in session with a recent passkey check may create or revoke grants. */
export interface OwnerAuth { owner: true; passkeyVerifiedAt: Date }
function assertOwner(auth: OwnerAuth | undefined, now: Date): void {
  if (!auth || auth.owner !== true || !(auth.passkeyVerifiedAt instanceof Date) || now.getTime() - auth.passkeyVerifiedAt.getTime() > PASSKEY_FRESH_MS || auth.passkeyVerifiedAt.getTime() > now.getTime()) {
    throw new Error('standing grants: owner with a fresh passkey check required');
  }
}

/** Founder-private and kill-team scopes are never covered by any standing grant. */
export function isExcludedScope(capability: string, scope?: string): boolean {
  return /^(founder[_-]?private|kill[_-]?team)/i.test(capability) || /^(founder[_-]?private|kill[_-]?team)$/i.test(scope ?? '');
}

async function registeredClass(capability: string): Promise<'A' | 'B' | 'C'> {
  const { registeredToolClass } = await import('@/lib/tool-registry');
  return registeredToolClass(capability); // the tool registry alone decides; no second table can lower it
}

/** A grant may only cover a plain Class B action: registered B, not protected, not an excluded scope. */
async function assertEligible(capability: string, params?: unknown): Promise<void> {
  if (classifyProtected({ toolName: capability, capability, params }).protected) throw new Error('standing grants: protected actions are never eligible');
  if (params !== undefined && SECRET_RULES.some((r) => r.re.test(JSON.stringify(params) ?? ''))) throw new Error('standing grants: content carrying a secret is never eligible');
  if (isExcludedScope(capability)) throw new Error('standing grants: founder-private and kill-team scopes are never eligible');
  if ((await registeredClass(capability)) !== 'B') throw new Error('standing grants: only registered Class B actions are eligible');
}

function lifetime(now: Date, ms: number, max: number): Date {
  if (!Number.isFinite(ms) || ms <= 0 || ms > max) throw new Error('standing grants: lifetime out of range');
  return new Date(now.getTime() + ms);
}

async function ledger(userId: string, grantId: string, kind: GrantKind, action: string, summary: string, status: 'EXECUTED' | 'DENIED' = 'EXECUTED', capability?: string) {
  await recordAction({ userId, initiator: 'user', action, permissionClass: 'B', status, tool: capability ?? null, inputSummary: summary, correlationId: `grant:${grantId}`, grantId, validationResult: JSON.stringify({ grantId, kind }) });
}

interface GrantRow { id: string; userId: string; kind: string; capability: string | null; team: string | null; paramsHash: string | null; dailyCap: number; usedDay: string; usedToday: number; expiresAt: Date; startsAt: Date; revokedAt: Date | null; content: unknown }

// ── creation ────────────────────────────────────────────────────────────────

async function create(userId: string, kind: GrantKind, data: { capability?: string; team?: string; paramsHash?: string; content?: object; dailyCap?: number }, expiresAt: Date, summary: string): Promise<string> {
  let row;
  try { row = await prisma.standingGrant.create({ data: { userId, kind, ...data, expiresAt } }); }
  catch (e) { if ((e as { code?: string })?.code === 'P2002') throw new Error('standing grants: a global window is already open'); throw e; }
  try { await ledger(userId, row.id, kind, 'standing_grant_created', summary, 'EXECUTED', data.capability); }
  catch (e) { await prisma.standingGrant.deleteMany({ where: { id: row.id, userId } }); throw e; } // no grant without a ledger row
  return row.id;
}

/** R4: agents of `team` may run `capability` (Class B) for the account, until `ms` from now. */
export async function createAgentTierGrant(userId: string, input: { capability: string; team: string; ms: number; dailyCap: number }, auth: OwnerAuth, now = new Date()): Promise<string> {
  if (!standingGrantsEnabled()) throw new Error('standing grants: switched off');
  assertOwner(auth, now);
  if (!input.team.trim() || !Number.isInteger(input.dailyCap) || input.dailyCap < 1) throw new Error('standing grants: team and a daily cap are required');
  await assertEligible(input.capability);
  return create(userId, 'agent_tier', { capability: input.capability, team: input.team, dailyCap: input.dailyCap }, lifetime(now, input.ms, MAX_GRANT_MS), `agent tier ${input.team} may run ${input.capability}, cap ${input.dailyCap}/day`);
}

/** R9: Global Approval window, routine Class B only, at most 24 hours, one at a time. */
export async function openGlobalWindow(userId: string, ms: number, auth: OwnerAuth, now = new Date()): Promise<string> {
  if (!standingGrantsEnabled()) throw new Error('standing grants: switched off');
  assertOwner(auth, now);
  if (await isLockedDown(userId)) throw new Error('standing grants: lockdown is active');
  const expiresAt = lifetime(now, ms, MAX_GLOBAL_MS);
  if (await getActiveGlobalWindow(userId, now)) throw new Error('standing grants: a global window is already open');
  return create(userId, 'global', {}, expiresAt, `Global Approval open until ${expiresAt.toISOString()} (routine Class B only)`);
}

/** For the on-screen banner. Null when none is open (an expired window is simply not returned: it reverts by itself). */
/** A lockdown change ends every global window opened before it, so a lift never revives one. */
async function endStaleGlobals(userId: string, now: Date): Promise<void> {
  const st = await getSafetyState(userId);
  if (st.changedAt) await prisma.standingGrant.updateMany({ where: { userId, kind: 'global', revokedAt: null, startsAt: { lt: new Date(st.changedAt) } }, data: { revokedAt: now } });
}

export async function getActiveGlobalWindow(userId: string, now = new Date()): Promise<{ id: string; expiresAt: Date } | null> {
  if (await isLockedDown(userId)) return null;
  await endStaleGlobals(userId, now);
  const r = await prisma.standingGrant.findFirst({ where: { userId, kind: 'global', revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } } });
  return r ? { id: r.id, expiresAt: r.expiresAt } : null;
}

/** Instant cancel for any grant. Owner only. */
export async function revokeGrant(userId: string, grantId: string, auth: OwnerAuth, now = new Date()): Promise<boolean> {
  assertOwner(auth, now);
  const won = await prisma.standingGrant.updateMany({ where: { id: grantId, userId, revokedAt: null }, data: { revokedAt: now } });
  if (won.count === 1) await recordActionSafe({ userId, initiator: 'user', action: 'standing_grant_revoked', permissionClass: 'B', status: 'EXECUTED', correlationId: `grant:${grantId}`, grantId });
  return won.count === 1;
}

// ── R5 learned delegations ──────────────────────────────────────────────────

/** Offer after 5 identical (same tool, same exact params) Class B approvals the owner gave and that ran. Null otherwise. */
export async function learnedOffer(userId: string, tool: string, params: unknown, now = new Date()): Promise<{ tool: string; count: number; paramsHash: string } | null> {
  if (!standingGrantsEnabled()) return null;
  try { await assertEligible(tool, params); } catch { return null; }
  const contentHash = approvalContentHash({ kind: 'tool_call', tool, params: JSON.parse(JSON.stringify(params ?? null)) });
  const count = await prisma.approvalRequest.count({ where: { userId, kind: 'tool_call', tool, contentHash, permissionClass: 'B', status: 'EXECUTED' } });
  if (count < LEARNED_THRESHOLD) return null;
  const paramsHash = toolArgsHash({ tool, args: params });
  const live = await prisma.standingGrant.findFirst({ where: { userId, kind: 'learned', capability: tool, paramsHash, revokedAt: null, expiresAt: { gt: now } } });
  return live ? null : { tool, count, paramsHash };
}

/** Owner accepts the offer. 30 day expiry, a daily cap, revocable. Re-checks the offer, never trusts the caller's numbers. */
export async function acceptLearned(userId: string, tool: string, params: unknown, dailyCap: number, auth: OwnerAuth, now = new Date()): Promise<string> {
  if (!standingGrantsEnabled()) throw new Error('standing grants: switched off');
  assertOwner(auth, now);
  if (!Number.isInteger(dailyCap) || dailyCap < 1 || dailyCap > 100) throw new Error('standing grants: daily cap must be 1 to 100');
  const offer = await learnedOffer(userId, tool, params, now);
  if (!offer) throw new Error('standing grants: no offer for this action');
  return create(userId, 'learned', { capability: tool, paramsHash: offer.paramsHash, dailyCap }, new Date(now.getTime() + MAX_GRANT_MS), `learned: ${tool} after ${offer.count} identical approvals, cap ${dailyCap}/day`);
}

// ── R8 template plus schedule ───────────────────────────────────────────────

/** Approve one exact tool call as a template for up to 30 days. Non-protected, registered Class B only. */
export async function createTemplateGrant(userId: string, input: { tool: string; args: unknown; ms: number; dailyCap: number }, auth: OwnerAuth, now = new Date()): Promise<string> {
  if (!standingGrantsEnabled()) throw new Error('standing grants: switched off');
  assertOwner(auth, now);
  if (!Number.isInteger(input.dailyCap) || input.dailyCap < 1) throw new Error('standing grants: a daily cap is required');
  await assertEligible(input.tool, input.args);
  const content = JSON.parse(JSON.stringify({ tool: input.tool, args: input.args ?? null }));
  return create(userId, 'template', { capability: input.tool, paramsHash: toolArgsHash({ tool: input.tool, args: input.args }), content, dailyCap: input.dailyCap }, lifetime(now, input.ms, MAX_GRANT_MS), `template for ${input.tool}, cap ${input.dailyCap}/day`);
}

/** Any edit cancels the template: the old grant is revoked and a new approval is needed. */
export async function editTemplate(userId: string, grantId: string, auth: OwnerAuth, now = new Date()): Promise<boolean> {
  return revokeGrant(userId, grantId, auth, now);
}

/** A scheduled run may proceed only if its exact tool and args hash to the approved template. */
export async function useTemplate(userId: string, grantId: string, call: { tool: string; args: unknown }, now = new Date()): Promise<boolean> {
  if (!standingGrantsEnabled() || (await isLockedDown(userId))) return false;
  const g = await prisma.standingGrant.findFirst({ where: { id: grantId, userId, kind: 'template', capability: call.tool, revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } } }) as GrantRow | null;
  if (!g || g.paramsHash !== toolArgsHash(call)) return false;
  try { await assertEligible(call.tool, call.args); } catch { return false; }
  if (!(await spend(g, now))) return false;
  try { await recordAction({ userId, initiator: 'system', action: 'standing_grant_used', permissionClass: 'B', status: 'EXECUTED', tool: call.tool, correlationId: `grant:${g.id}`, grantId: g.id, validationResult: JSON.stringify({ grantId: g.id, kind: 'template' }) }); } catch { return false; }
  return true;
}

// ── use at decision time (called by checkPermission for Class B only) ───────

async function spend(g: GrantRow, now: Date): Promise<boolean> {
  if (g.dailyCap <= 0) return true;
  const day = now.toISOString().slice(0, 10);
  await prisma.standingGrant.updateMany({ where: { id: g.id, usedDay: { not: day } }, data: { usedDay: day, usedToday: 0 } });
  const won = await prisma.standingGrant.updateMany({ where: { id: g.id, usedDay: day, usedToday: { lt: g.dailyCap } }, data: { usedToday: { increment: 1 } } });
  return won.count === 1;
}

/**
 * Does a standing grant let this Class B call run? Returns the grant id or null. Never called for Class C or protected calls.
 * agent_tier needs ctx.agentTeam to match; learned needs the same exact params; global covers any routine Class B.
 */
export async function findStandingGrant(userId: string, capability: string, cls: 'A' | 'B' | 'C', ctx: { params?: unknown; agentTeam?: string; scope?: string; tainted?: boolean } = {}, now = new Date()): Promise<{ id: string; kind: GrantKind } | null> {
  if (cls !== 'B' || ctx.tainted === true || !standingGrantsEnabled() || isExcludedScope(capability, ctx.scope)) return null;
  if (classifyProtected({ toolName: capability, capability, params: ctx.params }).protected) return null;
  if (await isLockedDown(userId)) {
    // Lockdown ends every global window at once.
    await prisma.standingGrant.updateMany({ where: { userId, kind: 'global', revokedAt: null }, data: { revokedAt: now } });
    return null;
  }
  await endStaleGlobals(userId, now);
  const rows = await prisma.standingGrant.findMany({
    where: { userId, revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now }, OR: [{ kind: 'global' }, { kind: 'agent_tier', capability, team: ctx.agentTeam ?? '\u0000' }, { kind: 'learned', capability }] },
    orderBy: { createdAt: 'asc' },
  }) as GrantRow[];
  const argsHash = toolArgsHash({ tool: capability, args: ctx.params });
  for (const g of rows) {
    if (g.kind === 'learned' && g.paramsHash !== argsHash) continue;
    if (!(await spend(g, now))) continue;
    // Strict: no ledger row, no run (non-negotiable 5).
    try { await recordAction({ userId, initiator: 'system', action: 'standing_grant_used', permissionClass: 'B', status: 'EXECUTED', tool: capability, correlationId: `grant:${g.id}`, grantId: g.id, validationResult: JSON.stringify({ grantId: g.id, kind: g.kind, windowId: g.kind === 'global' ? g.id : undefined }) }); } catch { return null; }
    return { id: g.id, kind: g.kind as GrantKind };
  }
  return null;
}

// ── R7 batch approval ───────────────────────────────────────────────────────

/** One card, N requests. Each is its own approval row: own id, own hash lock, own 30 s window. Protected items are refused. */
export async function createBatch(userId: string, items: Array<{ tool: string; params: unknown }>, now = new Date()): Promise<{ batchId: string; approvals: ApprovalView[] }> {
  if (!standingGrantsEnabled()) throw new Error('batch approval: switched off');
  if (items.length < 1 || items.length > MAX_BATCH) throw new Error(`batch approval: 1 to ${MAX_BATCH} items`);
  for (const it of items) if (classifyProtected({ toolName: it.tool, capability: it.tool, params: it.params }).protected) throw new Error('batch approval: protected actions need their own approval');
  const batchId = randomUUID();
  const approvals: ApprovalView[] = [];
  for (const it of items) approvals.push(await createApproval({ userId, kind: 'tool_call', tool: it.tool, params: it.params, correlationId: `batch:${batchId}`, now: () => now }));
  return { batchId, approvals };
}

/**
 * Decide every request on one batch card. The caller names each id; every id goes through decide() alone, so the
 * hash lock, expiry, lockdown and permission checks apply per item. Rows not from this batch, or protected, refuse the whole call.
 */
export async function decideBatch(userId: string, batchId: string, ids: string[], decision: 'approve' | 'deny', deps: Parameters<typeof decide>[3] = {}): Promise<DecisionOutcome[]> {
  if (!standingGrantsEnabled()) throw new Error('batch approval: switched off');
  const uniq = [...new Set(ids)];
  if (uniq.length < 1 || uniq.length > MAX_BATCH || uniq.length !== ids.length) throw new Error('batch approval: name each request id once');
  const rows = await prisma.approvalRequest.findMany({ where: { userId, id: { in: uniq }, correlationId: `batch:${batchId}` } });
  if (rows.length !== uniq.length) throw new Error('batch approval: ids are not all on this batch');
  for (const r of rows) if (r.kind !== 'tool_call' || !r.tool || classifyProtected({ toolName: r.tool, capability: r.tool, params: r.params }).protected) throw new Error('batch approval: protected actions need their own approval');
  const out: DecisionOutcome[] = [];
  for (const id of uniq) out.push(await decide(userId, id, decision, deps));
  return out;
}

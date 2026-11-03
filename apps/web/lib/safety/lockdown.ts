/**
 * R07 account lockdown. Server-enforced and account-persisted, never a UI toggle.
 *
 * While an account is locked down:
 *  - the worker claims no new job for it (lib/worker/scheduler.ts filters in SQL) and a claimed job is
 *    re-checked immediately before it runs (lib/worker/runner.ts);
 *  - outbound delivery (lib/comms/delivery.ts), approved executions (lib/approvals.ts), capability calls
 *    (lib/capability/invoke.ts) and tool calls (lib/tool-registry.ts) refuse before any I/O;
 *  - chat may only use a local model (app/api/conversations/[id]/messages/route.ts);
 *  - speech routes refuse and browsers release microphone, camera and audio (lib/safety/client-lockdown.ts).
 * Reading the ledger, approvals history and other local review screens stays available.
 *
 * Fail closed: if the state cannot be read, the account is treated as locked.
 * Every transition increments epoch and writes its ledger row in the same transaction.
 */
import { prisma } from '@/lib/db';
import { recordAction, recordActionSafe } from '@/lib/ledger';
import { logger } from '@/lib/logger';

export interface SafetyState {
  lockedDown: boolean;
  epoch: number;
  reason: string | null;
  changedAt: string | null;
  /** True when the state could not be read and the account is treated as locked. */
  unknown?: boolean;
}

export const LOCKDOWN_REASON = 'lockdown';
export const LOCKDOWN_MESSAGE = 'Lockdown is active. New jobs, outbound actions, cloud models, microphone and camera are stopped.';

export class LockdownError extends Error {
  readonly code = 'LOCKDOWN_ACTIVE';
  constructor(readonly boundary: string, readonly epoch: number) {
    super(LOCKDOWN_MESSAGE);
    this.name = 'LockdownError';
  }
}

const UNLOCKED: SafetyState = { lockedDown: false, epoch: 0, reason: null, changedAt: null };

export async function getSafetyState(userId: string): Promise<SafetyState> {
  if (!userId) return { lockedDown: true, epoch: -1, reason: 'no account', changedAt: null, unknown: true };
  try {
    const row = await prisma.accountSafetyState.findUnique({ where: { userId } });
    if (!row) return UNLOCKED;
    return { lockedDown: row.lockedDown === true, epoch: row.epoch, reason: row.reason ?? null, changedAt: row.changedAt ? new Date(row.changedAt).toISOString() : null };
  } catch (e) {
    logger.error('safety state unreadable; failing closed', { error: (e as Error)?.message });
    return { lockedDown: true, epoch: -1, reason: 'safety state unavailable', changedAt: null, unknown: true };
  }
}

export async function isLockedDown(userId: string): Promise<boolean> {
  return (await getSafetyState(userId)).lockedDown;
}

/**
 * Throw a LockdownError (and ledger the refusal) when the account is locked. Call it immediately before
 * the boundary does any I/O, not earlier, so an activation that lands in between is still honoured.
 */
export async function assertNotLockedDown(userId: string, boundary: string, correlationId?: string): Promise<void> {
  const s = await getSafetyState(userId);
  if (!s.lockedDown) return;
  await ledgerLockdownBlock(userId, boundary, correlationId);
  throw new LockdownError(boundary, s.epoch);
}

/** Ledger row for a refusal caused by lockdown. Never throws. */
export async function ledgerLockdownBlock(userId: string, boundary: string, correlationId?: string): Promise<void> {
  if (!userId) return;
  await recordActionSafe({
    userId,
    initiator: 'system',
    persona: 'WHINK',
    action: 'lockdown_blocked',
    tool: boundary.slice(0, 64),
    permissionClass: 'C',
    status: 'DENIED',
    outputSummary: LOCKDOWN_REASON,
    correlationId: correlationId ?? 'unknown',
  });
}

export type LockdownTransition = { ok: true; state: SafetyState; changed: boolean } | { ok: false; status: 409; error: string; state: SafetyState };

/**
 * Engage or release lockdown. Atomic: the state row and its ledger row are written in one transaction.
 * expectedEpoch (optional) makes release conditional on the state the Founder was looking at, so a
 * release clicked on a stale screen cannot undo a newer engagement.
 */
export async function setLockdown(
  userId: string,
  engage: boolean,
  opts: { reason?: string; expectedEpoch?: number; changedBy?: string; correlationId?: string } = {},
): Promise<LockdownTransition> {
  if (!userId) throw new Error('setLockdown: userId is required');
  const reason = (opts.reason ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200) || null;
  return prisma.$transaction(async (tx) => {
    // Row lock so two concurrent transitions serialise on the same account. The row is created first: with no
    // row, FOR UPDATE locks nothing and two first-ever engagements would both transition.
    await tx.$executeRaw`INSERT INTO account_safety_states ("userId") VALUES (${userId}) ON CONFLICT ("userId") DO NOTHING`;
    const rows = await tx.$queryRaw<Array<{ lockedDown: boolean; epoch: number }>>`
      SELECT "lockedDown", epoch FROM account_safety_states WHERE "userId" = ${userId} FOR UPDATE`;
    const cur = rows[0] ?? { lockedDown: false, epoch: 0 };
    const curState: SafetyState = { lockedDown: cur.lockedDown, epoch: cur.epoch, reason: null, changedAt: null };
    if (typeof opts.expectedEpoch === 'number' && opts.expectedEpoch !== cur.epoch) {
      return { ok: false as const, status: 409 as const, error: 'Safety state changed since it was loaded. Reload and try again.', state: curState };
    }
    if (cur.lockedDown === engage) return { ok: true as const, state: curState, changed: false };
    const now = new Date();
    // Engaging also stops queued work that was admitted before the lockdown: it is not resumed automatically on
    // release (the Founder re-submits it). A capability call already DISPATCHING cannot be recalled; its receipt shows
    // the real outcome. Running internal analyses are cancelled and their runner aborts on its next status check.
    let stopped = { capability: 0, executions: 0 };
    if (engage) {
      const cap = await tx.agentJob.updateMany({
        where: { userId, jobKey: { startsWith: 'capability:' }, lastStatus: 'QUEUED' },
        data: { lastStatus: 'BLOCKED_LOCKDOWN', lastError: LOCKDOWN_REASON, capabilityRequestEnc: null },
      });
      const ex = await tx.agentExecution.updateMany({
        where: { userId, status: { notIn: ['SUCCEEDED', 'FAILED', 'CANCELLED', 'BLOCKED_POLICY', 'BLOCKED_COST'] } },
        data: { status: 'CANCELLED', reason: LOCKDOWN_REASON },
      });
      await tx.agentJob.updateMany({
        where: { userId, jobKey: { startsWith: 'ear:' }, OR: [{ lastStatus: null }, { lastStatus: 'RETRY_SCHEDULED' }] },
        data: { lastStatus: 'CANCELLED' },
      });
      stopped = { capability: cap.count, executions: ex.count };
    }
    const next = await tx.accountSafetyState.upsert({
      where: { userId },
      create: { userId, lockedDown: engage, epoch: cur.epoch + 1, reason, changedBy: opts.changedBy ?? userId, changedAt: now },
      update: { lockedDown: engage, epoch: { increment: 1 }, reason, changedBy: opts.changedBy ?? userId, changedAt: now },
    });
    await recordAction({
      userId,
      initiator: 'user',
      persona: 'WHINK',
      action: engage ? 'lockdown_engaged' : 'lockdown_released',
      tool: 'safety_lockdown',
      permissionClass: 'A',
      status: 'EXECUTED',
      inputSummary: `epoch ${cur.epoch} -> ${next.epoch}` + (engage ? `; stopped queued capability=${stopped.capability} executions=${stopped.executions}` : ''),
      outputSummary: reason ? `reason: ${reason}` : undefined,
      correlationId: opts.correlationId ?? `lockdown-${next.epoch}`,
    }, tx);
    return {
      ok: true as const,
      changed: true,
      state: { lockedDown: next.lockedDown, epoch: next.epoch, reason: next.reason ?? null, changedAt: next.changedAt.toISOString() },
    };
  });
}

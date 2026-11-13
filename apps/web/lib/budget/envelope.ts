/**
 * budget/envelope.ts
 * Monthly spend envelope for exec-tier agents.
 *
 * Monthly limit: $25.00 = 25_000_000 micros (1 USD = 1_000_000 micros).
 * Shared across all exec agents for a given userId unless
 * WHINK_PER_AGENT_ENVELOPE=true (then envelopeKind = `exec:${agentId}`).
 *
 * Tables required (see migration/20261113000000_budget_tables.sql):
 *   budget_envelopes      (BudgetEnvelope model)
 *   budget_reservations   (BudgetReservation model)
 */

import { prisma } from '@/lib/db';
import { localYearMonth, monthStart, DEFAULT_TZ } from '@/lib/timezone';

// ── Constants ─────────────────────────────────────────────────────────────────

/** $25.00 in micros */
export const MONTHLY_EXEC_LIMIT_MICROS = BigInt(25_000_000);

const PER_AGENT = process.env.WHINK_PER_AGENT_ENVELOPE === 'true';

// ── Envelope kind ─────────────────────────────────────────────────────────────

export function execEnvelopeKind(agentId?: string): string {
  if (PER_AGENT && agentId) return `exec:${agentId.toUpperCase()}`;
  return 'exec';
}

// ── Core: open or fetch the current month's envelope ─────────────────────────

export interface BudgetEnvelopeRecord {
  id: string;
  userId: string;
  envelopeKind: string;
  periodStart: Date;
  limitMicros: bigint;
  spentMicros: bigint;
  state: string;
}

/**
 * Idempotent: returns the existing envelope for this user+kind+month,
 * or creates a new one with the default $25 limit.
 */
export async function getOrOpenMonthlyExecEnvelope(
  userId: string,
  agentId?: string,
  now = new Date(),
): Promise<BudgetEnvelopeRecord> {
  const tz = process.env.WHINK_TIMEZONE ?? DEFAULT_TZ;
  const yearMonth = localYearMonth(tz, now);
  const periodStart = monthStart(yearMonth, tz);
  const envelopeKind = execEnvelopeKind(agentId);

  const envelope = await prisma.budgetEnvelope.upsert({
    where: {
      userId_envelopeKind_periodStart: { userId, envelopeKind, periodStart },
    },
    create: {
      userId,
      envelopeKind,
      periodStart,
      limitMicros: MONTHLY_EXEC_LIMIT_MICROS,
      spentMicros: BigInt(0),
      state: 'open',
    },
    update: {}, // already exists — leave it unchanged
  });

  return envelope as BudgetEnvelopeRecord;
}

// ── Reserve ───────────────────────────────────────────────────────────────────

export interface ReserveResult {
  ok: boolean;
  reservationId?: string;
  reason?: 'overage' | 'envelope_closed';
}

/**
 * Atomically checks headroom and creates a reservation row.
 * Returns ok=false if the envelope is full or closed.
 *
 * `estimatedMicros`: rough cost estimate before the call executes.
 *                    Use 0 for free calls that still need ledger tracking.
 * `attemptKey`:      idempotency key; duplicate calls return ok=true silently.
 */
export async function reserveEnvelope(
  envelopeId: string,
  attemptKey: string,
  estimatedMicros: bigint,
): Promise<ReserveResult> {
  // 1. Re-read envelope inside a transaction for a consistent snapshot.
  const result = await prisma.$transaction(async (tx) => {
    const envelope = await tx.budgetEnvelope.findUniqueOrThrow({
      where: { id: envelopeId },
    });

    if (envelope.state !== 'open') {
      return { ok: false as const, reason: 'envelope_closed' as const };
    }

    const projectedSpend = BigInt(envelope.spentMicros) + estimatedMicros;
    if (projectedSpend > BigInt(envelope.limitMicros)) {
      return { ok: false as const, reason: 'overage' as const };
    }

    // Upsert reservation for idempotency
    const reservation = await tx.budgetReservation.upsert({
      where: { envelopeId_attemptKey: { envelopeId, attemptKey } },
      create: {
        envelopeId,
        attemptKey,
        reservedMicros: estimatedMicros,
        state: 'pending',
      },
      update: {},
    });

    return { ok: true as const, reservationId: reservation.id };
  });

  return result;
}

// ── Settle ────────────────────────────────────────────────────────────────────

/**
 * Records actual cost and marks the reservation settled.
 * Called after a successful exec-agent call with the real costMicros from
 * the UsageEvent row.
 */
export async function settleEnvelope(
  envelopeId: string,
  reservationId: string,
  actualMicros: bigint,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const reservation = await tx.budgetReservation.findUniqueOrThrow({
      where: { id: reservationId },
    });

    if (reservation.state !== 'pending') {
      // Already settled or released — no-op for idempotency.
      return;
    }

    const delta = actualMicros - BigInt(reservation.reservedMicros);

    await tx.budgetReservation.update({
      where: { id: reservationId },
      data: { state: 'settled', settledAt: new Date() },
    });

    await tx.budgetEnvelope.update({
      where: { id: envelopeId },
      data: {
        spentMicros: { increment: actualMicros },
        // If we're now over limit, mark overage (non-blocking — call already ran)
        state: {
          // Keep state expression safe with a raw conditional update
        },
        updatedAt: new Date(),
      },
    });

    // Separate pass to flip to 'overage' if needed (avoids complex nested expr)
    const updated = await tx.budgetEnvelope.findUniqueOrThrow({
      where: { id: envelopeId },
      select: { spentMicros: true, limitMicros: true, state: true },
    });
    if (
      updated.state === 'open' &&
      BigInt(updated.spentMicros) > BigInt(updated.limitMicros)
    ) {
      await tx.budgetEnvelope.update({
        where: { id: envelopeId },
        data: { state: 'overage' },
      });
    }

    void delta; // used only for the increment above — suppress unused warning
  });
}

// ── Release ───────────────────────────────────────────────────────────────────

/**
 * Releases a pending reservation on failure.
 * Does not subtract from spentMicros (reservation was never committed).
 */
export async function releaseReservation(reservationId: string): Promise<void> {
  await prisma.budgetReservation
    .updateMany({
      where: { id: reservationId, state: 'pending' },
      data: { state: 'released', settledAt: new Date() },
    })
    .catch(() => {
      // Best-effort — if the row is gone, that's fine.
    });
}

// ── withEnvelope wrapper ──────────────────────────────────────────────────────

export interface EnvelopeContext {
  envelopeId: string;
  reservationId: string;
}

/**
 * Reserve → execute → settle/release wrapper.
 *
 * Usage:
 *   const result = await withEnvelope(
 *     { userId, agentId, estimatedMicros: 500_000n, attemptKey: 'invoke:xyz' },
 *     async (ctx) => {
 *       const output = await runModel(...);
 *       return { output, actualMicros: output.costMicros };
 *     },
 *   );
 *
 * If the envelope is full, throws BudgetExceededError before `fn` is called.
 * If `fn` throws, the reservation is released.
 */
export class BudgetExceededError extends Error {
  constructor(
    public readonly envelopeId: string,
    public readonly reason: 'overage' | 'envelope_closed',
  ) {
    super(`Budget gate: ${reason} on envelope ${envelopeId}`);
    this.name = 'BudgetExceededError';
  }
}

export interface WithEnvelopeParams {
  userId: string;
  agentId?: string;
  /** Rough pre-call cost estimate in micros. Use 0n if unknown. */
  estimatedMicros: bigint;
  /** Idempotency key — tie to the action/attempt being executed. */
  attemptKey: string;
  now?: Date;
}

export async function withEnvelope<T extends { actualMicros: bigint }>(
  params: WithEnvelopeParams,
  fn: (ctx: EnvelopeContext) => Promise<T>,
): Promise<T> {
  const { userId, agentId, estimatedMicros, attemptKey, now = new Date() } = params;

  const envelope = await getOrOpenMonthlyExecEnvelope(userId, agentId, now);

  const reserve = await reserveEnvelope(envelope.id, attemptKey, estimatedMicros);
  if (!reserve.ok) {
    throw new BudgetExceededError(envelope.id, reserve.reason!);
  }

  const { reservationId } = reserve;

  try {
    const result = await fn({ envelopeId: envelope.id, reservationId: reservationId! });
    await settleEnvelope(envelope.id, reservationId!, result.actualMicros);
    return result;
  } catch (err) {
    await releaseReservation(reservationId!);
    throw err;
  }
}

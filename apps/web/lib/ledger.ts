/**
 * Ledger — the single write path to the Action table.
 *
 * Every action (ran, waited, denied, failed) lands here. No other file in lib/ or app/
 * may call prisma.action.create or prisma.action.update (enforced by a test).
 * All writes and updates are scoped by userId (tenant isolation).
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const SUMMARY_CAP = 2000;

export type LedgerStatus =
  | 'SUBMITTED'
  | 'VALIDATED'
  | 'EXECUTED'
  | 'FAILED'
  | 'UNVERIFIED'
  | 'AWAITING_APPROVAL'
  | 'DENIED';

export interface LedgerEntry {
  userId: string;
  action: string;
  permissionClass: string;
  status: LedgerStatus;
  tool?: string | null;
  persona?: string | null;
  mambaMode?: string | null;
  initiator?: 'user' | 'system' | 'automation';
  inputSummary?: string | null;
  outputSummary?: string | null;
  correlationId?: string | null;
  latencyMs?: number | null;
  confirmationMethod?: string | null;
  validationResult?: string | null;
}

/** Convenience alias used in API routes. metadata is serialised to inputSummary. */
export interface WriteLedgerEntry extends Omit<LedgerEntry, 'inputSummary'> {
  metadata?: Record<string, unknown> | null;
  inputSummary?: string | null;
}

export interface LedgerPatch {
  status?: LedgerStatus;
  confirmationMethod?: string | null;
  outputSummary?: string | null;
  outcome?: string | null;
  postmortem?: string | null;
  latencyMs?: number | null;
}

function cap(v: string | null | undefined): string | null | undefined {
  if (v == null) return v;
  return v.length > SUMMARY_CAP ? v.substring(0, SUMMARY_CAP) : v;
}

/** Awaitable write. Throws on failure. Returns the new row id. */
export async function recordAction(entry: LedgerEntry): Promise<{ id: string }> {
  if (!entry.userId) throw new Error('ledger: userId is required');
  const row = await prisma.action.create({
    data: {
      userId: entry.userId,
      initiator: entry.initiator ?? 'system',
      persona: entry.persona ?? undefined,
      mambaMode: entry.mambaMode ?? undefined,
      tool: entry.tool ?? undefined,
      action: entry.action,
      permissionClass: entry.permissionClass,
      confirmationMethod: entry.confirmationMethod ?? undefined,
      status: entry.status,
      inputSummary: cap(entry.inputSummary) ?? undefined,
      outputSummary: cap(entry.outputSummary) ?? undefined,
      validationResult: entry.validationResult ?? undefined,
      correlationId: entry.correlationId ?? undefined,
      latencyMs: entry.latencyMs ?? undefined,
    },
  });
  return { id: row.id };
}

/** Fire-and-forget write. Never throws; logs failure (no payload content). */
export async function recordActionSafe(entry: LedgerEntry): Promise<{ id: string } | null> {
  try {
    return await recordAction(entry);
  } catch (e) {
    logger.error('ledger write failed', {
      userId: entry?.userId,
      action: entry?.action,
      error: (e as Error)?.message,
    });
    return null;
  }
}

/**
 * Update an action row. Scoped by BOTH id and userId so one tenant can never touch
 * another tenant's row. Returns true when exactly one row was updated.
 */
export async function updateActionStatus(
  userId: string,
  actionId: string,
  patch: LedgerPatch,
): Promise<boolean> {
  if (!userId || !actionId) throw new Error('ledger: userId and actionId are required');
  const data: Record<string, unknown> = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.confirmationMethod !== undefined) data.confirmationMethod = patch.confirmationMethod;
  if (patch.outputSummary !== undefined) data.outputSummary = cap(patch.outputSummary);
  if (patch.outcome !== undefined) data.outcome = cap(patch.outcome);
  if (patch.postmortem !== undefined) data.postmortem = cap(patch.postmortem);
  if (patch.latencyMs !== undefined) data.latencyMs = patch.latencyMs;
  const res = await prisma.action.updateMany({ where: { id: actionId, userId }, data });
  return res.count === 1;
}

/**
 * Convenience write used by API routes. Serialises metadata into inputSummary.
 * Falls back to recordActionSafe (never throws).
 */
export async function writeLedger(entry: WriteLedgerEntry): Promise<{ id: string } | null> {
  const { metadata, ...rest } = entry;
  const inputSummary =
    rest.inputSummary ?? (metadata ? JSON.stringify(metadata) : undefined) ?? null;
  return recordActionSafe({ ...rest, inputSummary });
}

/**
 * Count this user's ledger rows for the given tools since a time, optionally until a time.
 * Read-only and scoped by userId. Used for daily caps; never returns row content.
 */
export async function countToolExecutions(
  userId: string,
  tools: string[],
  since: Date,
  until?: Date,
): Promise<number> {
  if (!userId) throw new Error('ledger: userId is required');
  if (tools.length === 0) return 0;
  return prisma.action.count({
    where: {
      userId,
      tool: { in: tools },
      action: { in: tools.map((t) => `tool_executed: ${t}`) },
      status: { in: ['SUBMITTED', 'VALIDATED'] },
      createdAt: { gte: since, ...(until ? { lt: until } : {}) },
    },
  });
}

/**
 * Count this user's ledger rows for one tool and correlation id, by status. Read-only and
 * scoped by userId. Used by scheduled jobs to stay once-per-day without extra tables.
 */
export async function countByCorrelation(
  userId: string,
  tool: string,
  correlationId: string,
  statuses: LedgerStatus[],
): Promise<number> {
  if (!userId) throw new Error('ledger: userId is required');
  if (statuses.length === 0) return 0;
  return prisma.action.count({
    where: { userId, tool, correlationId, status: { in: statuses } },
  });
}

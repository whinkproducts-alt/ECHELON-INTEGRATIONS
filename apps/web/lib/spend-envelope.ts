/**
 * R15: the model-inference spend envelope. Victor sets a daily and a monthly cap in CAD and a CAD-per-USD rate (providers bill in USD).
 * Switching it on or raising spending power needs his approval of the exact figures (kind 'spend_envelope').
 * Lowering or switching off applies at once. It covers model inference only: no transfers, purchases or trades.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { createApproval, type ApprovalView } from '@/lib/approvals';
import { recordAction } from '@/lib/ledger';

export interface Envelope { enabled: boolean; dailyCadMicros: number; monthlyCadMicros: number; cadPerUsd: number }
// 1.37 is a placeholder rate, not a looked-up one: Victor sets the real rate in the settings box.
export const DEFAULT_ENVELOPE: Envelope = { enabled: false, dailyCadMicros: 1_000_000, monthlyCadMicros: 20_000_000, cadPerUsd: 1.37 };

export function parseEnvelope(v: unknown): Envelope | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const d = o.dailyCadMicros, m = o.monthlyCadMicros, r = o.cadPerUsd;
  if (typeof o.enabled !== 'boolean' || !Number.isInteger(d) || !Number.isInteger(m) || typeof r !== 'number') return null;
  const dn = d as number, mn = m as number;
  if (dn <= 0 || mn <= 0 || dn > mn || mn > 2_000_000_000) return null;
  if (!(r >= 0.5 && r <= 5)) return null; // sanity range for a CAD per USD rate
  return { enabled: o.enabled, dailyCadMicros: dn, monthlyCadMicros: mn, cadPerUsd: r };
}

/** USD micros the dispatcher compares costs against, or null when the envelope is off. */
export function usdCaps(e: Envelope | null | undefined): { dailyMicros: number; monthlyMicros: number } | null {
  if (!e?.enabled) return null;
  return { dailyMicros: Math.floor(e.dailyCadMicros / e.cadPerUsd), monthlyMicros: Math.floor(e.monthlyCadMicros / e.cadPerUsd) };
}

/** True when the change gives more spending power than today, which needs approval. */
export function isRaise(cur: Envelope, next: Envelope): boolean {
  if (!next.enabled) return false;
  if (!cur.enabled) return true;
  const a = usdCaps(cur)!, b = usdCaps(next)!;
  return b.dailyMicros > a.dailyMicros || b.monthlyMicros > a.monthlyMicros;
}

export async function getEnvelope(userId: string): Promise<Envelope> {
  const row = await prisma.spendEnvelope.findUnique({ where: { userId } });
  return row ? { enabled: row.enabled, dailyCadMicros: row.dailyCadMicros, monthlyCadMicros: row.monthlyCadMicros, cadPerUsd: row.cadPerUsd } : DEFAULT_ENVELOPE;
}

async function save(userId: string, e: Envelope, correlationId: string): Promise<void> {
  await prisma.spendEnvelope.upsert({ where: { userId }, create: { userId, ...e }, update: e });
  await recordAction({
    userId, initiator: 'user', action: 'spend_envelope_set', permissionClass: 'C', status: 'EXECUTED', correlationId,
    inputSummary: `enabled=${e.enabled} dailyCAD=${e.dailyCadMicros / 1e6} monthlyCAD=${e.monthlyCadMicros / 1e6} cadPerUsd=${e.cadPerUsd}`,
  });
}

/** Lowering applies at once; anything that raises spending power becomes an approval of the exact figures. */
export async function requestEnvelopeChange(userId: string, next: Envelope): Promise<{ applied: true } | { applied: false; approval: ApprovalView }> {
  const cur = await getEnvelope(userId);
  if (!isRaise(cur, next)) { await save(userId, next, randomUUID()); return { applied: true }; }
  const approval = await createApproval({
    userId, kind: 'spend_envelope', tool: null, params: next, permissionClass: 'C', correlationId: randomUUID(),
    summary: `Allow model spending up to CA$${next.dailyCadMicros / 1e6}/day and CA$${next.monthlyCadMicros / 1e6}/month (rate ${next.cadPerUsd} CAD per USD)`,
  });
  return { applied: false, approval };
}

/** Called by the approval handler after the approval won and the hash matched. */
export async function applyApprovedEnvelope(userId: string, params: unknown, approvalId: string): Promise<boolean> {
  const e = parseEnvelope(params);
  if (!e) return false;
  await save(userId, e, `approval:${approvalId}`);
  return true;
}

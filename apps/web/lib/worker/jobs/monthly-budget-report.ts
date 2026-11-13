/**
 * worker/jobs/monthly-budget-report.ts
 * End-of-month exec spend report delivered in-app + email.
 *
 * Runs on the first day of each month via SYSTEM_JOBS schedule.
 * Reports the PREVIOUS month's total exec spend for the user.
 *
 * Models used (all verified against schema.prisma):
 *   prisma.usageEvent        → table usage_events (confirmed line ~1020)
 *   prisma.recommendation    → in-app delivery with dedupeKey
 *   prisma.budgetEnvelope    → envelope state + spentMicros
 *   prisma.notificationPreference → email address lookup
 */

import { prisma } from '@/lib/db';
import { localYearMonth, monthStart, DEFAULT_TZ } from '@/lib/timezone';
import { notify } from '@/lib/notifications/deliver';
import { execEnvelopeKind, MONTHLY_EXEC_LIMIT_MICROS } from '@/lib/budget/envelope';

// ── Entry point ───────────────────────────────────────────────────────────────

export interface BudgetReportJobParams {
  userId: string;
  now?: Date;
}

/**
 * Generates and delivers the monthly exec budget report.
 * Idempotent — duplicate runs for the same period are no-ops.
 */
export async function runMonthlyBudgetReport(
  params: BudgetReportJobParams,
): Promise<void> {
  const { userId, now = new Date() } = params;
  const tz = process.env.WHINK_TIMEZONE ?? DEFAULT_TZ;

  // We report for the PREVIOUS month (this job runs at the start of a new month)
  const prevMonthDate = new Date(now);
  prevMonthDate.setDate(0); // last day of previous month
  const periodKey = localYearMonth(tz, prevMonthDate);
  const dedupeKey = `budget_report_${periodKey}`;

  // Idempotency check: skip if already delivered
  const existing = await prisma.recommendation.findFirst({
    where: { userId, dedupeKey },
    select: { id: true },
  });
  if (existing) return;

  // ── Gather spend data ──────────────────────────────────────────────────────

  const periodStart = monthStart(periodKey, tz);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  // periodEnd = midnight of current month's day 1 = exclusive upper bound

  // Aggregate actual spend from UsageEvent rows in the period
  const spendRows = await prisma.usageEvent.groupBy({
    by: ['state'],
    where: {
      userId,
      periodStart: { gte: periodStart, lt: periodEnd },
      state: 'settled',
    },
    _sum: { costMicros: true },
  });

  const totalMicros = BigInt(
    spendRows.reduce(
      (acc, row) => acc + (row._sum.costMicros ?? 0),
      0,
    ),
  );

  // Also read envelope record for authoritative spentMicros (may differ if
  // events were written outside the envelope system)
  const envelopeKind = execEnvelopeKind();
  const envelope = await prisma.budgetEnvelope.findFirst({
    where: { userId, envelopeKind, periodStart },
    select: { spentMicros: true, limitMicros: true, state: true },
  });

  const authoritative = envelope
    ? BigInt(envelope.spentMicros)
    : totalMicros;

  const limitMicros = envelope
    ? BigInt(envelope.limitMicros)
    : MONTHLY_EXEC_LIMIT_MICROS;

  // ── Format report ──────────────────────────────────────────────────────────

  const spentDollars = Number(authoritative) / 1_000_000;
  const limitDollars = Number(limitMicros) / 1_000_000;
  const pctUsed = limitDollars > 0
    ? Math.round((spentDollars / limitDollars) * 100)
    : 0;
  const remaining = limitDollars - spentDollars;

  const title = `Exec Spend Report — ${periodKey}`;
  const body = formatReportBody({
    periodKey,
    spentDollars,
    limitDollars,
    pctUsed,
    remainingDollars: remaining,
    envelopeState: envelope?.state ?? 'unknown',
  });

  // ── Deliver ────────────────────────────────────────────────────────────────

  await notify({
    userId,
    dedupeKey,
    title,
    body,
    severity: pctUsed >= 90 ? 'warning' : 'info',
    emailSubject: title,
  });
}

// ── Formatting ────────────────────────────────────────────────────────────────

interface ReportBodyParams {
  periodKey: string;
  spentDollars: number;
  limitDollars: number;
  pctUsed: number;
  remainingDollars: number;
  envelopeState: string;
}

function formatReportBody(p: ReportBodyParams): string {
  const spent = p.spentDollars.toFixed(4);
  const limit = p.limitDollars.toFixed(2);
  const remaining = Math.max(0, p.remainingDollars).toFixed(4);
  const statusLine =
    p.pctUsed >= 100
      ? '⚠️  Limit reached — calls were blocked once the envelope closed.'
      : p.pctUsed >= 90
      ? `⚠️  ${p.pctUsed}% utilised — approaching limit.`
      : `✅  ${p.pctUsed}% utilised — within budget.`;

  return [
    `ECHELON Exec Spend Report`,
    `Period: ${p.periodKey}`,
    ``,
    `  Spent:     $${spent}`,
    `  Limit:     $${limit}`,
    `  Remaining: $${remaining}`,
    `  Envelope:  ${p.envelopeState}`,
    ``,
    statusLine,
  ].join('\n');
}

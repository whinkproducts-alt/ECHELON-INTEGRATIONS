/**
 * worker/jobs/monthly-budget-report.ts
 * End-of-month spend report delivered in-app + email.
 *
 * Runs on the first day of each month via SYSTEM_JOBS schedule.
 * Reports the PREVIOUS UTC month's settled spend, open holds, and unpriced events.
 *
 * Models used (all verified against schema.prisma):
 *   prisma.usageEvent        → table usage_events (confirmed line ~1020)
 *   prisma.recommendation    → in-app delivery with dedupeKey
 *   prisma.notificationPreference → email address lookup
 */

import { prisma } from '@/lib/db';
import { monthStart } from '@/lib/model-router/admission';
import { notify } from '@/lib/notifications/deliver';
import { spendCapMicros } from '@/lib/model-router/admission';

// ── Entry point ───────────────────────────────────────────────────────────────

export interface BudgetReportJobParams {
  userId: string;
  now?: Date;
}

/**
 * Generates and delivers the monthly spend report.
 * Idempotent — duplicate runs for the same period are no-ops.
 */
export async function runMonthlyBudgetReport(
  params: BudgetReportJobParams,
): Promise<void> {
  const { userId, now = new Date() } = params;

  // We report for the PREVIOUS UTC calendar month (this job runs at the start of a new month)
  const currentMonthStart = monthStart(now);
  const previousMonthStart = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - 1, 1));
  const periodKey = `${previousMonthStart.getUTCFullYear()}-${String(previousMonthStart.getUTCMonth() + 1).padStart(2, '0')}`;
  const dedupeKey = `budget_report_${periodKey}`;

  // Idempotency check: skip if already delivered
  const existing = await prisma.recommendation.findFirst({
    where: { userId, dedupeKey },
    select: { id: true },
  });
  if (existing) return;

  // ── Gather spend data ──────────────────────────────────────────────────────

  const periodEnd = currentMonthStart; // exclusive upper bound

  // Settled spend: sum of costMicros where state is settled and createdAt is inside the UTC month window
  const spendRows = await prisma.usageEvent.groupBy({
    by: ['state'],
    where: {
      userId,
      createdAt: { gte: previousMonthStart, lt: periodEnd },
      state: 'settled',
    },
    _sum: { costMicros: true },
  });

  const settledMicros = BigInt(
    spendRows.reduce(
      (acc: number, row: any) => acc + (row._sum.costMicros ?? 0),
      0,
    ),
  );

  // Unpriced events: settled rows with null costMicros
  const unpricedCount = await prisma.usageEvent.count({
    where: {
      userId,
      createdAt: { gte: previousMonthStart, lt: periodEnd },
      state: 'settled',
      costMicros: null,
    },
  });

  // Open holds: sum of reservedMicros for state 'reserved' or 'held', no date filter
  const holdRows = await prisma.usageEvent.groupBy({
    by: ['state'],
    where: {
      userId,
      state: { in: ['reserved', 'held'] },
    },
    _sum: { reservedMicros: true },
  });

  const holdMicros = BigInt(
    holdRows.reduce(
      (acc: number, row: any) => acc + (row._sum.reservedMicros ?? 0),
      0,
    ),
  );

  // Cap from admission system
  const capMicros = spendCapMicros();

  // ── Format report ──────────────────────────────────────────────────────────

  const spentDollars = Number(settledMicros) / 1_000_000;
  const holdDollars = Number(holdMicros) / 1_000_000;
  const limitDollars = capMicros ? Number(capMicros) / 1_000_000 : null;
  const pctUsed = limitDollars && limitDollars > 0
    ? Math.round((spentDollars / limitDollars) * 100)
    : null;
  const remaining = limitDollars ? limitDollars - spentDollars : null;

  const title = `Spend Report — ${periodKey}`;
  const body = formatReportBody({
    periodKey,
    spentDollars,
    holdDollars,
    unpricedCount,
    limitDollars,
    pctUsed,
    remainingDollars: remaining,
  });

  // ── Deliver ────────────────────────────────────────────────────────────────

  await notify({
    userId,
    dedupeKey,
    title,
    body,
    severity: pctUsed !== null && pctUsed >= 90 ? 'warning' : 'info',
    emailSubject: title,
  });
}

// ── Formatting ────────────────────────────────────────────────────────────────

interface ReportBodyParams {
  periodKey: string;
  spentDollars: number;
  holdDollars: number;
  unpricedCount: number;
  limitDollars: number | null;
  pctUsed: number | null;
  remainingDollars: number | null;
}

function formatReportBody(p: ReportBodyParams): string {
  const spent = p.spentDollars.toFixed(4);
  const holds = p.holdDollars.toFixed(4);
  const unpriced = p.unpricedCount.toString();
  const limit = p.limitDollars !== null ? p.limitDollars.toFixed(2) : 'not set';
  const remaining = p.remainingDollars !== null ? Math.max(0, p.remainingDollars).toFixed(4) : 'N/A';

  let statusLine = '';
  if (p.limitDollars === null) {
    statusLine = '⚠️  No monthly spend cap is set; metered calls are refused.';
  } else if (p.pctUsed !== null && p.pctUsed >= 100) {
    statusLine = '⚠️  Limit reached — metered calls are blocked.';
  } else if (p.pctUsed !== null && p.pctUsed >= 90) {
    statusLine = `⚠️  ${p.pctUsed}% utilised — approaching limit.`;
  } else if (p.pctUsed !== null) {
    statusLine = `✅  ${p.pctUsed}% utilised — within budget.`;
  } else {
    statusLine = '✅  No limit set.';
  }

  return [
    `ECHELON Monthly Spend Report`,
    `Period: ${p.periodKey} (UTC)`,
    ``,
    `  Settled spend:  $${spent}`,
    `  Open holds:     $${holds} (reserved, not yet confirmed)`,
    `  Unpriced events: ${unpriced} (settled, cost unknown)`,
    `  Limit:          $${limit}`,
    `  Remaining:      $${remaining}`,
    ``,
    statusLine,
  ].join('\n');
}
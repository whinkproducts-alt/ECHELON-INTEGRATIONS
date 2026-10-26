/**
 * Read-only finance analytics. Every number is read from stored rows; nothing is estimated.
 * Money is summed by the database (exact DECIMAL) per currency, and combined here in integer
 * cents (BigInt), never as floating point and never across currencies.
 * Nothing in this module writes, pays, transfers or sends.
 */
import { prisma } from '@/lib/db';
import { budgetState, monthWindow } from '@/lib/budget';

const DAY_MS = 86_400_000;
export const UPCOMING_DAYS = 90;

/** Parse a decimal string like "1234.50" to integer cents. Throws on anything else. */
export function toCents(v: { toFixed(n: number): string } | string): bigint {
  const s = typeof v === 'string' ? v : v.toFixed(2);
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error('finance: not a money value');
  const cents = BigInt(m[2]) * 100n + BigInt((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] === '-' ? -cents : cents;
}

export function formatCents(c: bigint): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

export interface GroupRow {
  subsidiary: string | null;
  status: string;
  currency: string;
  _count: { _all: number };
  _sum: { valueAmount: { toFixed(n: number): string } | null };
}

export interface ContractValueRow { subsidiary: string | null; status: string; currency: string; total: string; contracts: number; contractsWithValue: number }

/** Pure: turns grouped rows into per currency totals. Exported for tests. */
export function combineContractValue(rows: GroupRow[]) {
  const byGroup: ContractValueRow[] = rows.map((r) => ({
    subsidiary: r.subsidiary, status: r.status, currency: r.currency,
    total: formatCents(r._sum.valueAmount ? toCents(r._sum.valueAmount) : 0n),
    contracts: r._count._all,
    contractsWithValue: r._sum.valueAmount ? r._count._all : 0,
  }));
  const totals = new Map<string, { cents: bigint; contracts: number }>();
  for (const r of rows) {
    const t = totals.get(r.currency) ?? { cents: 0n, contracts: 0 };
    t.cents += r._sum.valueAmount ? toCents(r._sum.valueAmount) : 0n;
    t.contracts += r._count._all;
    totals.set(r.currency, t);
  }
  const byCurrency = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, t]) => ({ currency, total: formatCents(t.cents), contracts: t.contracts }));
  return { byGroup, byCurrency };
}

export async function financeSummary(userId: string, now = new Date()) {
  if (!userId) throw new Error('finance: userId is required');
  const horizon = new Date(now.getTime() + UPCOMING_DAYS * DAY_MS);
  const live = { in: ['DRAFT', 'ACTIVE'] };
  const { start } = monthWindow(now);

  const [grouped, endings, renewals, budget, cost] = await Promise.all([
    prisma.contract.groupBy({ by: ['subsidiary', 'status', 'currency'], where: { userId }, _sum: { valueAmount: true }, _count: { _all: true } }),
    prisma.contract.findMany({ where: { userId, status: live, endDate: { gte: now, lte: horizon } }, orderBy: { endDate: 'asc' }, take: 100 }),
    prisma.contract.findMany({ where: { userId, status: live, renewalDate: { gte: now, lte: horizon } }, orderBy: { renewalDate: 'asc' }, take: 100 }),
    budgetState(userId, now),
    prisma.usageEvent.aggregate({ where: { userId, createdAt: { gte: start } }, _sum: { tokensIn: true, tokensOut: true, costMicros: true }, _count: { _all: true } }),
  ]);

  const { byGroup, byCurrency } = combineContractValue(grouped as unknown as GroupRow[]);
  const upcoming = [
    ...endings.map((c) => ({ kind: 'end' as const, date: c.endDate as Date, c })),
    ...renewals.map((c) => ({ kind: 'renewal' as const, date: c.renewalDate as Date, c })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime()).map(({ kind, date, c }) => ({
    kind, date: date.toISOString(), contractId: c.id, title: c.title, counterparty: c.counterparty, subsidiary: c.subsidiary,
    status: c.status, valueAmount: c.valueAmount ? c.valueAmount.toFixed(2) : null, currency: c.currency,
  }));

  return {
    asOf: now.toISOString(),
    contracts: {
      byGroup,
      byCurrency,
      total: byGroup.reduce((n, g) => n + g.contracts, 0),
    },
    upcoming: { windowDays: UPCOMING_DAYS, items: upcoming },
    modelSpend: {
      month: start.toISOString().slice(0, 7),
      calls: cost._count._all,
      tokensIn: cost._sum.tokensIn ?? 0,
      tokensOut: cost._sum.tokensOut ?? 0,
      // Stored per call at record time from WHINK_MODEL_PRICES; 0 when no prices are configured.
      costMicros: cost._sum.costMicros ?? 0,
      monthlyTokenBudget: budget.limit,
      budgetState: budget.state,
      resetsAt: budget.resetsAt,
    },
    omitted: [{ field: 'spendBySubsidiary', reason: 'Usage events carry no project or swarm link, so spend cannot be attributed to a subsidiary without guessing.' }],
  };
}

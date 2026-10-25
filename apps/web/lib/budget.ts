/**
 * Per-user monthly token budget. Limit comes from the user's preference row, else tenant
 * env (WHINK_MONTHLY_TOKEN_BUDGET). 0 or unset means unlimited (state is always 'ok').
 * Soft and hard thresholds are percentages (defaults 80 and 100).
 * The month is a UTC calendar month.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { runGuarded } from '@/lib/guarded-action';

export type BudgetStateName = 'ok' | 'soft' | 'hard';
export interface BudgetState {
  state: BudgetStateName;
  used: number;
  /** null when unlimited. */
  limit: number | null;
  softPct: number;
  hardPct: number;
  resetsAt: string;
}

function envInt(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function monthWindow(now: Date): { start: Date; resetsAt: Date } {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

/**
 * Effective monthly limit. The operator cap (tenant/env) is a ceiling a user cannot remove:
 * with a cap set, the limit is min(user value, cap), and a user value of 0 or null means "the cap",
 * never unlimited. With no cap, the user value applies and 0 or null is unlimited (returns null).
 */
export function effectiveLimit(userValue: number | null, cap: number): number | null {
  const hasCap = cap > 0;
  const hasUser = userValue !== null && userValue > 0;
  if (hasCap) return hasUser ? Math.min(userValue as number, cap) : cap;
  return hasUser ? (userValue as number) : null;
}

/** Pure decision, exported for tests. */
export function decideBudget(used: number, limit: number | null, softPct: number, hardPct: number): BudgetStateName {
  if (!limit || limit <= 0) return 'ok';
  if (used >= (limit * hardPct) / 100) return 'hard';
  if (used >= (limit * softPct) / 100) return 'soft';
  return 'ok';
}

export async function budgetState(userId: string, now = new Date()): Promise<BudgetState> {
  if (!userId) throw new Error('budget: userId is required');
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { monthlyTokenBudget: true, budgetSoftPct: true, budgetHardPct: true },
  });
  const limit = effectiveLimit(pref?.monthlyTokenBudget == null ? null : Number(pref.monthlyTokenBudget), envInt('WHINK_MONTHLY_TOKEN_BUDGET', 0));
  // A user may tighten the thresholds but never loosen past the tenant ceiling.
  const hardCeiling = envInt('WHINK_BUDGET_HARD_PCT', 100);
  const hardPct = Math.min(pref?.budgetHardPct ?? hardCeiling, hardCeiling);
  const softPct = Math.min(pref?.budgetSoftPct ?? envInt('WHINK_BUDGET_SOFT_PCT', 80), hardPct);
  const { start, resetsAt } = monthWindow(now);
  const agg = await prisma.usageEvent.aggregate({
    where: { userId, createdAt: { gte: start } },
    _sum: { tokensIn: true, tokensOut: true },
  });
  const used = (agg?._sum?.tokensIn ?? 0) + (agg?._sum?.tokensOut ?? 0);
  return { state: decideBudget(used, limit, softPct, hardPct), used, limit, softPct, hardPct, resetsAt: resetsAt.toISOString() };
}

export const BudgetInputSchema = z.object({
  monthlyTokenBudget: z.number().int().min(0).max(10_000_000_000),
  softPct: z.number().int().min(1).max(100).optional(),
  hardPct: z.number().int().min(1).max(200).optional(),
}).strict().refine((v) => (v.softPct ?? 80) <= (v.hardPct ?? 100), { message: 'softPct must not exceed hardPct' });

export async function setBudget(userId: string, input: z.infer<typeof BudgetInputSchema>) {
  if (!userId) throw new Error('budget: userId is required');
  return runGuarded(
    { userId, capability: 'usage_budget_set', permissionClass: 'A', action: 'usage_budget_updated', summary: `limit=${input.monthlyTokenBudget} soft=${input.softPct ?? 'default'} hard=${input.hardPct ?? 'default'}` },
    async () => {
      const data = { monthlyTokenBudget: BigInt(input.monthlyTokenBudget), budgetSoftPct: input.softPct ?? null, budgetHardPct: input.hardPct ?? null };
      await prisma.userPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      return budgetState(userId);
    },
  );
}

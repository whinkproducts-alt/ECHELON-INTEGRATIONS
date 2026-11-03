/**
 * Usage recording. One function, recordUsage, called from the model router paths.
 * Fire-and-forget: it returns synchronously, never throws and never delays a response.
 * Every row carries userId; reads are scoped by userId.
 *
 * Cost: prices are optional config (env WHINK_MODEL_PRICES, JSON of
 * {"<model prefix>": {"in": <USD per 1M input tokens>, "out": <USD per 1M output tokens>}}).
 * With no price the cost is null (unknown), never a guess. USD per 1M tokens equals micro-USD per token.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export type UsageKind = 'chat' | 'tool_loop' | 'embed' | 'other';

export interface UsageInput {
  userId: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  kind?: UsageKind;
}

/** Durable accounting for background admission boundaries; failure stops further work. */
export async function recordUsageStrict(input: UsageInput): Promise<void> {
  if (!input.userId) throw new Error('usage: userId is required');
  const tokensIn = clampInt(input.tokensIn);
  const tokensOut = clampInt(input.tokensOut);
  await prisma.usageEvent.create({ data: {
    userId: input.userId, provider: input.provider, model: input.model.slice(0, 100),
    tokensIn, tokensOut, costMicros: estimateCostMicros(input.model, tokensIn, tokensOut), kind: input.kind ?? 'other',
  } });
}

function clampInt(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 2_000_000_000) : 0;
}

export function estimateCostMicros(model: string, tokensIn: number, tokensOut: number, pricesJson = process.env.WHINK_MODEL_PRICES): number | null {
  if (!pricesJson || tokensIn + tokensOut === 0) return null;
  try {
    const prices = JSON.parse(pricesJson) as Record<string, { in?: number; out?: number }>;
    const key = Object.keys(prices).filter((p) => model.startsWith(p)).sort((a, b) => b.length - a.length)[0];
    if (!key) return null;
    const p = prices[key];
    if (typeof p.in !== 'number' || typeof p.out !== 'number' || !Number.isFinite(p.in) || !Number.isFinite(p.out) || p.in < 0 || p.out < 0) return null;
    const cost = Math.round(p.in * tokensIn + p.out * tokensOut);
    return cost <= 2_147_483_647 ? cost : null;
  } catch {
    return null;
  }
}

export function recordUsage(input: UsageInput): void {
  try {
    if (!input.userId) return;
    const tokensIn = clampInt(input.tokensIn);
    const tokensOut = clampInt(input.tokensOut);
    if (tokensIn === 0 && tokensOut === 0) return;
    void Promise.resolve(
      prisma.usageEvent.create({
        data: {
          userId: input.userId,
          provider: input.provider,
          model: input.model.substring(0, 100),
          tokensIn,
          tokensOut,
          costMicros: estimateCostMicros(input.model, tokensIn, tokensOut),
          kind: input.kind ?? 'chat',
        },
      }),
    ).catch((e: unknown) => logger.warn('usage record failed', { userId: input.userId, error: (e as Error)?.message }));
  } catch (e) {
    logger.warn('usage record failed', { error: (e as Error)?.message });
  }
}

export interface DailyUsage { day: string; tokensIn: number; tokensOut: number; unknownCostCalls: number; costMicros: number }
export interface ModelUsage { model: string; provider: string; tokensIn: number; tokensOut: number; unknownCostCalls: number; costMicros: number; calls: number }

export const USAGE_RANGES = { '7d': 7, '30d': 30 } as const;
export type UsageRange = keyof typeof USAGE_RANGES;

/** Daily and per-model aggregates for one user. Computed in application code from a bounded read. */
export async function usageSummary(userId: string, range: UsageRange, now = new Date()) {
  if (!userId) throw new Error('usage: userId is required');
  const days = USAGE_RANGES[range];
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const rows = await prisma.usageEvent.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { provider: true, model: true, tokensIn: true, tokensOut: true, costMicros: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 50_000,
  });
  const daily = new Map<string, DailyUsage>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    daily.set(d, { day: d, tokensIn: 0, tokensOut: 0, unknownCostCalls: 0, costMicros: 0 });
  }
  const models = new Map<string, ModelUsage>();
  for (const r of rows) {
    const d = daily.get(r.createdAt.toISOString().slice(0, 10));
    if (d) { d.tokensIn += r.tokensIn; d.tokensOut += r.tokensOut; d.costMicros += r.costMicros ?? 0; d.unknownCostCalls += Number(r.costMicros === null); }
    const modelKey = JSON.stringify([r.provider, r.model]);
    const m = models.get(modelKey) ?? { model: r.model, provider: r.provider, tokensIn: 0, tokensOut: 0, unknownCostCalls: 0, costMicros: 0, calls: 0 };
    m.tokensIn += r.tokensIn; m.tokensOut += r.tokensOut; m.costMicros += r.costMicros ?? 0; m.unknownCostCalls += Number(r.costMicros === null); m.calls += 1;
    models.set(modelKey, m);
  }
  return { range, daily: [...daily.values()], byModel: [...models.values()].sort((a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut)) };
}

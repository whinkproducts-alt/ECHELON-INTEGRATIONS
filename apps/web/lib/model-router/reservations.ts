// Account-scoped admission for callers that reserve local inference. Never authorizes cloud dispatch.
import { prisma } from '@/lib/db';
import { budgetState } from '@/lib/budget';
import { estimateCostMicros } from '@/lib/usage';

export async function reserveLocalAnalysis(userId: string, model: string, tokens: number) {
  if (!userId || !Number.isSafeInteger(tokens) || tokens <= 0 || tokens > 2_000_000_000) throw new Error('BLOCKED_COST');
  return prisma.$transaction(async (tx) => {
    // Lock the existing account, including on its first call. Independent workers see committed holds.
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (rows.length !== 1) throw new Error('BLOCKED_COST');
    const now = new Date();
    const b = await budgetState(userId, now, tx);
    if (b.limit !== null && b.used + b.reserved + tokens > Math.floor(b.limit * b.hardPct / 100)) throw new Error('BLOCKED_COST');
    return tx.usageEvent.create({ data: { userId, model, provider: 'local-analysis', kind: 'other', usageBasis: 'reserved', reservedTokens: tokens, createdAt: now, state: 'reserved', purpose: 'worker', costClass: 'local', periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } });
  }, { isolationLevel: 'ReadCommitted' });
}

export async function settleLocalAnalysis(userId: string, id: string, model: string, tokensIn: number, tokensOut: number) {
  if (![tokensIn, tokensOut].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 2_000_000_000)) throw new Error('BLOCKED_COST');
  const result = await prisma.usageEvent.updateMany({
    where: { id, userId, model, provider: 'local-analysis', usageBasis: 'reserved' },
    data: { usageBasis: 'estimated', state: 'settled', reservedTokens: 0, tokensIn, tokensOut, costMicros: estimateCostMicros(model, tokensIn, tokensOut), settledAt: new Date() },
  });
  if (result.count !== 1) throw new Error('BLOCKED_COST');
}

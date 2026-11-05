/**
 * Real Postgres admission lifecycle. No provider is called: every transport is replaced by the facts
 * under test (reserve/settle/hold/release/reconcile). Opt in with M1_EXECUTION_DATABASE_URL matching
 * DATABASE_URL and a database whose name contains "test".
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
import { prisma } from '@/lib/db';
import {
  DispatchBlockedError,
  reconcileDispatch,
  holdDispatch,
  releaseDispatch,
  reserveDispatch,
  settleDispatch,
} from '@/lib/model-router/admission';
import { budgetState } from '@/lib/budget';

const enabled = !!process.env.M1_EXECUTION_DATABASE_URL;
const unlocked = async () => ({ lockedDown: false });
let userA = '';
let userB = '';

const env = (o: Record<string, string> = {}) => ({ ...process.env, ...o } as NodeJS.ProcessEnv);
const base = (userId: string, o: Partial<Parameters<typeof reserveDispatch>[0]> = {}) => ({
  userId, purpose: 'chat' as const, model: 'local-model', maxTokens: 100, inputChars: 400, ...o,
});

describe.skipIf(!enabled)('real database dispatch admission', () => {
  beforeAll(async () => {
    const url = process.env.M1_EXECUTION_DATABASE_URL!;
    if (url !== process.env.DATABASE_URL || !/test/.test(new URL(url).pathname)) throw new Error('Explicit isolated test database required');
    await prisma.usageEvent.count();
    userA = (await prisma.user.create({ data: { email: `adm-a-${Date.now()}@example.test` } })).id;
    userB = (await prisma.user.create({ data: { email: `adm-b-${Date.now()}@example.test` } })).id;
  });

  beforeEach(async () => {
    await prisma.usageEvent.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.userPreference.deleteMany({ where: { userId: { in: [userA, userB] } } });
  });

  afterAll(async () => {
    if (userA) {
      await prisma.usageEvent.deleteMany({ where: { userId: { in: [userA, userB] } } });
      await prisma.userPreference.deleteMany({ where: { userId: { in: [userA, userB] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    }
    await prisma.$disconnect();
  });

  it('concurrent reservations cannot both take the last capacity', async () => {
    await prisma.userPreference.create({ data: { userId: userA, monthlyTokenBudget: 100 } });
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () =>
      reserveDispatch({ ...base(userA), maxTokens: 75, inputChars: 0 }, { readSafety: unlocked, env: env({ WHINK_MONTHLY_TOKEN_BUDGET: '100' }) })));
    const winners = attempts.flatMap((a) => a.status === 'fulfilled' ? [a.value] : []);
    expect(winners).toHaveLength(1);
    const b = await budgetState(userA);
    expect(b).toMatchObject({ used: 0 });
    expect(b.reserved).toBe(winners[0].reservedTokens);
  });

  it('settles once, refuses another account, and never reuses an attempt key', async () => {
    const r = await reserveDispatch({ ...base(userA), attemptKey: 'attempt1' }, { readSafety: unlocked, env: env() });
    await expect(settleDispatch({ userId: userB, attemptKey: r.attemptKey, tokensIn: 5, tokensOut: 5, basis: 'estimated' })).rejects.toThrow(DispatchBlockedError);
    await settleDispatch({ userId: userA, attemptKey: r.attemptKey, tokensIn: 7, tokensOut: 3, basis: 'estimated', model: 'local-model' });
    await expect(settleDispatch({ userId: userA, attemptKey: r.attemptKey, tokensIn: 1, tokensOut: 1, basis: 'estimated' })).rejects.toThrow(DispatchBlockedError);
    const row = await prisma.usageEvent.findUniqueOrThrow({ where: { userId_attemptKey: { userId: userA, attemptKey: r.attemptKey } } });
    expect(row).toMatchObject({ state: 'settled', reservedTokens: 0, tokensIn: 7, tokensOut: 3, usageBasis: 'estimated' });
    await expect(reserveDispatch({ ...base(userA), attemptKey: 'attempt1' }, { readSafety: unlocked, env: env() })).rejects.toThrow(DispatchBlockedError);
  });

  it('a lost response keeps its hold, and release only applies to an unsent attempt', async () => {
    const r = await reserveDispatch({ ...base(userA), attemptKey: 'attempt2' }, { readSafety: unlocked, env: env() });
    await holdDispatch({ userId: userA, attemptKey: r.attemptKey, uncertainty: 'timeout' });
    const row = await prisma.usageEvent.findUniqueOrThrow({ where: { userId_attemptKey: { userId: userA, attemptKey: r.attemptKey } } });
    expect(row).toMatchObject({ state: 'held', uncertainty: 'timeout' });
    await expect(releaseDispatch({ userId: userA, attemptKey: r.attemptKey, externalAttemptStarted: false })).rejects.toThrow(DispatchBlockedError);
    const live = await reconcileDispatch(userA);
    expect(live.outstanding).toBe(1);
    expect(live.retried).toBe(0);
  });

  it('releases an attempt that never left the machine', async () => {
    const r = await reserveDispatch({ ...base(userA), attemptKey: 'attempt3' }, { readSafety: unlocked, env: env() });
    await releaseDispatch({ userId: userA, attemptKey: r.attemptKey, externalAttemptStarted: false });
    const row = await prisma.usageEvent.findUniqueOrThrow({ where: { userId_attemptKey: { userId: userA, attemptKey: r.attemptKey } } });
    expect(row).toMatchObject({ state: 'released', reservedTokens: 0, reservedMicros: 0 });
  });

  it('a hold opened last month still counts against this month', async () => {
    await prisma.userPreference.create({ data: { userId: userA, monthlyTokenBudget: 100 } });
    const lastMonth = new Date('2026-10-31T23:00:00Z');
    await reserveDispatch(base(userA, { maxTokens: 80, inputChars: 0, attemptKey: 'attempt4' }), {
      readSafety: unlocked, now: lastMonth, env: env({ WHINK_MONTHLY_TOKEN_BUDGET: '100' }),
    });
    const next = await reserveDispatch({ ...base(userA, { maxTokens: 30, inputChars: 0, attemptKey: 'attempt5' }) }, {
      readSafety: unlocked, now: new Date('2026-11-01T00:30:00Z'), env: env({ WHINK_MONTHLY_TOKEN_BUDGET: '100' }),
    }).catch((e) => e);
    expect(next).toBeInstanceOf(DispatchBlockedError);
    expect((next as DispatchBlockedError).code).toBe('TOKEN_HARD_LIMIT');
    expect((await budgetState(userA, new Date('2026-11-01T00:30:00Z'))).reserved).toBeGreaterThan(0);
    const rec = await reconcileDispatch(userA, new Date('2026-11-01T00:30:00Z'));
    expect(rec.priorMonth).toBe(1);
  });

  it('metered dispatch needs the operator flag, a known price and a cap', async () => {
    const metered = { ...base(userA), model: 'claude-sonnet-test', maxTokens: 10, inputChars: 0 };
    await expect(reserveDispatch(metered, { readSafety: unlocked, env: env() })).rejects.toMatchObject({ code: 'PAID_NOT_ADMITTED' });
    await expect(reserveDispatch(metered, { readSafety: unlocked, env: env({ WHINK_PAID_MODELS_ENABLED: 'true', WHINK_MONTHLY_SPEND_MICROS: '1000000' }) })).rejects.toMatchObject({ code: 'UNKNOWN_PRICE' });
    const ok = await reserveDispatch(metered, {
      readSafety: unlocked,
      env: env({ WHINK_PAID_MODELS_ENABLED: 'true', WHINK_MONTHLY_SPEND_MICROS: '1000000', WHINK_MODEL_PRICES: '{"claude-sonnet-test":{"in":3,"out":15}}' }),
    });
    expect(ok.costClass).toBe('metered');
    expect(ok.reservedMicros).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulates the atomic upsert: one counter per (key, windowStart).
const { counters, state, queryRaw, executeRaw, warn } = vi.hoisted(() => {
  const counters = new Map<string, number>();
  const state = { dbDown: false };
  const queryRaw = vi.fn(async (_strings: TemplateStringsArray, key: string, windowStart: Date) => {
    if (state.dbDown) throw new Error('connection refused');
    const id = `${key}|${windowStart.getTime()}`;
    const n = (counters.get(id) ?? 0) + 1;
    counters.set(id, n);
    return [{ count: n }];
  });
  return { counters, state, queryRaw, executeRaw: vi.fn(async () => 0), warn: vi.fn() };
});

vi.mock('@/lib/db', () => ({ prisma: { $queryRaw: queryRaw, $executeRaw: executeRaw } }));
vi.mock('@/lib/logger', () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), security: vi.fn() } }));

import { PostgresRateLimitStore } from '../rate-limit-postgres';
import { resolveStoreKind } from '../rate-limit';

const rule = { limit: 3, windowMs: 60_000 };

describe('PostgresRateLimitStore', () => {
  beforeEach(() => {
    counters.clear();
    state.dbDown = false;
    queryRaw.mockClear();
    executeRaw.mockClear();
    warn.mockClear();
  });

  it('uses a single bound-parameter upsert per hit and enforces the limit', async () => {
    const s = new PostgresRateLimitStore();
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect((await s.hit('auth:a', rule, t)).allowed).toBe(true);
    const r = await s.hit('auth:a', rule, t);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(queryRaw).toHaveBeenCalledTimes(4);
    const sql = queryRaw.mock.calls[0][0].join('?');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('"count" + 1');
    expect(sql).toContain('RETURNING');
  });

  it('is atomic under concurrency: exactly limit hits are allowed', async () => {
    const s = new PostgresRateLimitStore();
    const results = await Promise.all(Array.from({ length: 10 }, () => s.hit('auth:b', rule, 5_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  it('a new window starts a fresh counter (expiry)', async () => {
    const s = new PostgresRateLimitStore();
    for (let i = 0; i < 4; i++) await s.hit('auth:c', rule, 10_000);
    expect((await s.hit('auth:c', rule, 10_000)).allowed).toBe(false);
    expect((await s.hit('auth:c', rule, 10_000 + 60_000)).allowed).toBe(true);
  });

  it('isolates keys', async () => {
    const s = new PostgresRateLimitStore();
    for (let i = 0; i < 5; i++) await s.hit('auth:x', rule, 1);
    expect((await s.hit('auth:x', rule, 1)).allowed).toBe(false);
    expect((await s.hit('auth:y', rule, 1)).allowed).toBe(true);
    expect((await s.hit('signup:x', rule, 1)).allowed).toBe(true);
  });

  it('falls back to memory when the database is down, still enforcing, warning once a minute', async () => {
    state.dbDown = true;
    const s = new PostgresRateLimitStore();
    const out = [];
    for (let i = 0; i < 5; i++) out.push(await s.hit('auth:d', rule, 100 + i));
    expect(out.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(warn).toHaveBeenCalledTimes(1);
    await s.hit('auth:d', rule, 100 + 61_000);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('cleans up expired rows opportunistically, not on every request', async () => {
    const s = new PostgresRateLimitStore();
    await s.hit('k', rule, 1_000_000);
    await s.hit('k', rule, 1_000_100);
    await s.hit('k', rule, 1_000_200);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    await s.hit('k', rule, 1_000_000 + 61_000);
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });
});

describe('resolveStoreKind', () => {
  it('honours the flag and defaults by DATABASE_URL', () => {
    expect(resolveStoreKind({ RATE_LIMIT_STORE: 'memory', DATABASE_URL: 'x' })).toBe('memory');
    expect(resolveStoreKind({ RATE_LIMIT_STORE: 'postgres' })).toBe('postgres');
    expect(resolveStoreKind({ DATABASE_URL: 'postgres://x' })).toBe('postgres');
    expect(resolveStoreKind({})).toBe('memory');
    expect(resolveStoreKind({ DATABASE_URL: 'x', NODE_ENV: 'test' })).toBe('memory');
  });
});

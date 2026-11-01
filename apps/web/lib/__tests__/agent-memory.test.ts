/**
 * Tests for lib/agent-memory.ts
 * Prisma is mocked — no real DB calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock Prisma ───────────────────────────────────────────────────────────────
const mockFindMany = vi.fn();
const mockCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    agentKnowledge: {
      findMany: mockFindMany,
      create: mockCreate,
    },
  },
}));

// Import after mocking
const { readContext, writeDebrief } = await import('@/lib/agent-memory');

// ── helpers ───────────────────────────────────────────────────────────────────
function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    agentId: 'backend-engineer',
    domain: 'database',
    taskType: 'migration',
    lesson: 'Always run migrations in a transaction',
    outcome: 'success',
    tags: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── writeDebrief ──────────────────────────────────────────────────────────────
describe('writeDebrief', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('persists a record with the correct fields', async () => {
    const created = makeRecord();
    mockCreate.mockResolvedValueOnce(created);

    const result = await writeDebrief({
      agentId: 'backend-engineer',
      domain: 'database',
      taskType: 'migration',
      lesson: 'Always run migrations in a transaction',
      outcome: 'success',
      tags: ['prisma', 'postgres'],
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArg = mockCreate.mock.calls[0][0].data;
    expect(callArg.agentId).toBe('backend-engineer');
    expect(callArg.domain).toBe('database');
    expect(callArg.taskType).toBe('migration');
    expect(callArg.lesson).toBe('Always run migrations in a transaction');
    expect(callArg.outcome).toBe('success');
    expect(callArg.tags).toBe(JSON.stringify(['prisma', 'postgres']));
    expect(result).toBe(created);
  });

  it('stores null for tags when none provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCreate.mockResolvedValueOnce(makeRecord({ tags: null }));

    await writeDebrief({
      agentId: 'backend-engineer',
      domain: 'database',
      taskType: 'migration',
      lesson: 'lesson text',
      outcome: 'failure',
    });

    const callArg = mockCreate.mock.calls[0][0].data;
    expect(callArg.tags).toBeNull();
  });
});

// ── readContext ───────────────────────────────────────────────────────────────
describe('readContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns exact domain+taskType matches first', async () => {
    const exact = [makeRecord({ id: 'e1' }), makeRecord({ id: 'e2' })];
    // First call: exact match query; second call: backfill (not reached when exact === limit)
    mockFindMany.mockResolvedValueOnce(exact).mockResolvedValueOnce([]);

    const results = await readContext('backend-engineer', 'database', 'migration', 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('e1');

    // Only one findMany call because exact.length === limit
    expect(mockFindMany).toHaveBeenCalledOnce();
    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.domain).toBe('database');
    expect(whereArg.taskType).toBe('migration');
  });

  it('backfills with same-domain results when exact matches are fewer than limit', async () => {
    const exact = [makeRecord({ id: 'e1', taskType: 'migration' })];
    const backfill = [makeRecord({ id: 'b1', taskType: 'schema_change' })];
    mockFindMany.mockResolvedValueOnce(exact).mockResolvedValueOnce(backfill);

    const results = await readContext('backend-engineer', 'database', 'migration', 3);

    expect(results).toHaveLength(2); // 1 exact + 1 backfill
    expect(results[0].id).toBe('e1');
    expect(results[1].id).toBe('b1');

    // Second call must NOT filter by taskType (domain-wide backfill)
    expect(mockFindMany).toHaveBeenCalledTimes(2);
    const backfillWhere = mockFindMany.mock.calls[1][0].where;
    expect(backfillWhere.taskType).toBeUndefined();
    expect(backfillWhere.domain).toBe('database');
  });

  it('returns empty array without throwing when table is empty', async () => {
    mockFindMany.mockResolvedValue([]);

    const results = await readContext('backend-engineer', 'database', 'migration', 5);
    expect(results).toEqual([]);
    expect(mockFindMany).toHaveBeenCalledTimes(2); // exact + backfill, both empty
  });

  it('scopes by agentId — agent A lessons do not appear for agent B', async () => {
    const agentARecord = makeRecord({ id: 'a1', agentId: 'backend-engineer' });
    // Simulate: agentId filter ensures no records returned for agent B
    mockFindMany.mockResolvedValue([]);

    const results = await readContext('frontend-engineer', 'database', 'migration', 5);
    expect(results).toEqual([]);

    for (const call of mockFindMany.mock.calls) {
      expect(call[0].where.agentId).toBe('frontend-engineer');
    }
    // Verify agentARecord agentId is different — its records would never be returned
    expect(agentARecord.agentId).not.toBe('frontend-engineer');
  });
});

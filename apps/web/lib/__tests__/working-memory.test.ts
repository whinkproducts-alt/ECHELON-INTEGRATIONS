/**
 * Tests for lib/working-memory.ts
 * Prisma is mocked — no real DB calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock Prisma ───────────────────────────────────────────────────────────────
const mockUpsert = vi.fn();
const mockFindUnique = vi.fn();
const mockDeleteMany = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workingMemory: {
      upsert: mockUpsert,
      findUnique: mockFindUnique,
      deleteMany: mockDeleteMany,
      delete: mockDelete,
    },
  },
}));

const { setWorkingMemory, getWorkingMemory, clearWorkingMemory } = await import('@/lib/working-memory');

describe('setWorkingMemory', () => {
  beforeEach(() => vi.resetAllMocks());

  it('calls prisma upsert with correct userId and key', async () => {
    mockUpsert.mockResolvedValueOnce({});
    await setWorkingMemory('user-a', 'my-key', 'my-value');
    expect(mockUpsert).toHaveBeenCalledOnce();
    const args = mockUpsert.mock.calls[0][0];
    expect(args.where.userId_key).toEqual({ userId: 'user-a', key: 'my-key' });
    expect(args.create.value).toBe('my-value');
  });

  it('uses custom TTL when provided', async () => {
    mockUpsert.mockResolvedValueOnce({});
    const before = Date.now();
    await setWorkingMemory('user-a', 'k', 'v', 60);
    const after = Date.now();
    const expiresAt: Date = mockUpsert.mock.calls[0][0].create.expiresAt;
    const diff = expiresAt.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(59_000);
    expect(diff).toBeLessThanOrEqual(60_000 + (after - before));
  });
});

describe('getWorkingMemory', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns value when row exists and not expired', async () => {
    mockFindUnique.mockResolvedValueOnce({
      userId: 'user-a',
      key: 'k',
      value: 'hello',
      expiresAt: new Date(Date.now() + 10_000),
    });
    const result = await getWorkingMemory('user-a', 'k');
    expect(result).toBe('hello');
  });

  it('returns null when row not found', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const result = await getWorkingMemory('user-a', 'missing');
    expect(result).toBeNull();
  });

  it('returns null and cleans up when row is expired', async () => {
    mockFindUnique.mockResolvedValueOnce({
      userId: 'user-a',
      key: 'k',
      value: 'old',
      expiresAt: new Date(Date.now() - 1000),
    });
    mockDelete.mockResolvedValueOnce({});
    const result = await getWorkingMemory('user-a', 'k');
    expect(result).toBeNull();
    expect(mockDelete).toHaveBeenCalledOnce();
  });
});

describe('clearWorkingMemory', () => {
  beforeEach(() => vi.resetAllMocks());

  it('deletes all keys for userId when no key given', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 3 });
    await clearWorkingMemory('user-a');
    const args = mockDeleteMany.mock.calls[0][0];
    expect(args.where.userId).toBe('user-a');
    expect(args.where.key).toBeUndefined();
  });

  it('deletes only the specific key when key is given', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 1 });
    await clearWorkingMemory('user-a', 'specific-key');
    const args = mockDeleteMany.mock.calls[0][0];
    expect(args.where.userId).toBe('user-a');
    expect(args.where.key).toBe('specific-key');
  });
});

describe('tenant isolation — working memory', () => {
  beforeEach(() => vi.resetAllMocks());

  it('user A key does not return user B data', async () => {
    // user B has a value stored; user A queries same key — mock returns null
    mockFindUnique.mockImplementation(({ where }: any) => {
      if (where.userId_key.userId === 'user-b') {
        return Promise.resolve({ userId: 'user-b', key: 'k', value: 'secret', expiresAt: new Date(Date.now() + 10_000) });
      }
      return Promise.resolve(null);
    });

    const resultA = await getWorkingMemory('user-a', 'k');
    expect(resultA).toBeNull();
    // Verify prisma was queried with user-a's scope, not user-b
    const callArg = mockFindUnique.mock.calls[0][0];
    expect(callArg.where.userId_key.userId).toBe('user-a');
  });
});

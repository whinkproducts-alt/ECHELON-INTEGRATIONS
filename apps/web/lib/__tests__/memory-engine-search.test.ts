/**
 * Regression tests for searchMemory in lib/memory-engine.ts.
 * Covers: vector path (embedding available) and LIKE fallback (embedding unavailable).
 * Prisma and generateEmbedding are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── shared mock state ─────────────────────────────────────────────────────────
const mockQueryRawUnsafe = vi.fn();
const mockSemanticFindMany = vi.fn();
const mockEpisodeFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
    memorySemantic: { findMany: mockSemanticFindMany },
    memoryEpisode: { findMany: mockEpisodeFindMany },
    memoryProcedural: { findMany: vi.fn().mockResolvedValue([]) },
    hypothesis: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn() } }));

// embedding-service is mocked per test via doMock — use resetModules pattern
describe('searchMemory — LIKE fallback (embedding unavailable)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it('calls Prisma findMany with LIKE when embedding returns null', async () => {
    vi.doMock('@/lib/embedding-service', () => ({
      generateEmbedding: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        $queryRawUnsafe: mockQueryRawUnsafe,
        memorySemantic: {
          findMany: mockSemanticFindMany.mockResolvedValueOnce([
            { id: 's1', statement: 'Victor is CEO', supersededBy: null },
          ]),
        },
        memoryEpisode: {
          findMany: mockEpisodeFindMany.mockResolvedValueOnce([]),
        },
        hypothesis: {
          findMany: vi.fn().mockResolvedValueOnce([]),
        },
        memoryProcedural: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    }));
    vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn() } }));

    const { searchMemory } = await import('../memory-engine');
    const results = await searchMemory('user-a', 'CEO');

    // Should not have called the raw SQL vector path
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
    // Should have called findMany (LIKE path)
    expect(mockSemanticFindMany).toHaveBeenCalledOnce();
    expect(results.semantics).toHaveLength(1);
    expect(results.semantics[0].statement).toBe('Victor is CEO');
  });
});

describe('searchMemory — vector path (embedding available)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it('calls $queryRawUnsafe when embedding returns a vector', async () => {
    const fakeVec = new Array(1536).fill(0.1);
    vi.doMock('@/lib/embedding-service', () => ({
      generateEmbedding: vi.fn().mockResolvedValue(fakeVec),
    }));

    const semanticRow = { id: 's1', statement: 'Victor runs WHINK', distance: 0.1 };
    const episodeRow = { id: 'e1', summary: 'Meeting in Calgary', distance: 0.2 };

    vi.doMock('@/lib/db', () => ({
      prisma: {
        $queryRawUnsafe: vi.fn()
          .mockResolvedValueOnce([semanticRow])  // semanticVec
          .mockResolvedValueOnce([episodeRow])   // episodeVec
          .mockResolvedValueOnce([])             // semanticFt
          .mockResolvedValueOnce([]),            // episodeFt
        memorySemantic: { findMany: vi.fn() },
        memoryEpisode: { findMany: vi.fn() },
        hypothesis: { findMany: vi.fn().mockResolvedValue([]) },
        memoryProcedural: { findMany: vi.fn().mockResolvedValue([]) },
      },
    }));
    vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn() } }));

    const { searchMemory } = await import('../memory-engine');
    const results = await searchMemory('user-a', 'WHINK CEO');

    // Prisma raw was called (vector path)
    const { prisma } = await import('@/lib/db');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalled();

    // findMany (LIKE) should NOT have been called because vector returned rows
    expect(prisma.memorySemantic.findMany).not.toHaveBeenCalled();
    expect(prisma.memoryEpisode.findMany).not.toHaveBeenCalled();
  });

  it('falls back to LIKE when vector path returns no rows', async () => {
    const fakeVec = new Array(1536).fill(0.1);
    vi.doMock('@/lib/embedding-service', () => ({
      generateEmbedding: vi.fn().mockResolvedValue(fakeVec),
    }));

    const semanticFindMany = vi.fn().mockResolvedValueOnce([{ id: 's2', statement: 'fallback result', supersededBy: null }]);
    const episodeFindMany = vi.fn().mockResolvedValueOnce([]);

    vi.doMock('@/lib/db', () => ({
      prisma: {
        $queryRawUnsafe: vi.fn()
          .mockResolvedValueOnce([])  // semanticVec empty
          .mockResolvedValueOnce([])  // episodeVec empty
          .mockResolvedValueOnce([])  // semanticFt empty
          .mockResolvedValueOnce([]), // episodeFt empty
        memorySemantic: { findMany: semanticFindMany },
        memoryEpisode: { findMany: episodeFindMany },
        hypothesis: { findMany: vi.fn().mockResolvedValue([]) },
        memoryProcedural: { findMany: vi.fn().mockResolvedValue([]) },
      },
    }));
    vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn() } }));

    const { searchMemory } = await import('../memory-engine');
    const results = await searchMemory('user-a', 'fallback');

    expect(semanticFindMany).toHaveBeenCalledOnce();
    expect(results.semantics[0].statement).toBe('fallback result');
  });
});

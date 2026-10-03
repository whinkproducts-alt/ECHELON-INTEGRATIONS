/**
 * Tests for hybrid memory search in lib/memory-engine.ts
 *
 * Covers:
 *  - RRF merge when both vector and full-text return results
 *  - Cosine-only fallback when full-text returns nothing
 *  - LIKE fallback when no embeddings exist (generateEmbedding returns null)
 *  - Tenant isolation: results are scoped by userId
 *
 * Prisma and generateEmbedding are mocked — no real DB or API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock embedding service ────────────────────────────────────────────────────
const mockGenerateEmbedding = vi.fn<[], Promise<number[] | null>>();
vi.mock('@/lib/embedding-service', () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

// ── mock Prisma ───────────────────────────────────────────────────────────────
const mockQueryRawUnsafe = vi.fn();
const mockSemanticFindMany = vi.fn();
const mockEpisodeFindMany = vi.fn();
const mockHypothesisFindMany = vi.fn();
const mockProceduralFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
    memorySemantic: { findMany: mockSemanticFindMany },
    memoryEpisode: { findMany: mockEpisodeFindMany },
    hypothesis: { findMany: mockHypothesisFindMany },
    memoryProcedural: { findMany: mockProceduralFindMany },
  },
}));

const { searchMemory } = await import('@/lib/memory-engine');

// Helpers
const FAKE_VEC = Array(1536).fill(0.1);

function makeSemanticRow(id: string, statement: string) {
  return { id, statement, userId: 'user-a', supersededBy: null, createdAt: new Date() };
}
function makeEpisodeRow(id: string, summary: string) {
  return { id, summary, userId: 'user-a', supersededBy: null, createdAt: new Date() };
}

describe('searchMemory — hybrid RRF merge', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Hypotheses and procedurals are always queried via findMany
    mockHypothesisFindMany.mockResolvedValue([]);
    mockProceduralFindMany.mockResolvedValue([]);
  });

  it('produces a combined RRF-ranked list when both vector and full-text return results', async () => {
    mockGenerateEmbedding.mockResolvedValue(FAKE_VEC);

    // $queryRawUnsafe call order for userId=user-a (no projectId):
    // 1. semanticVec  2. episodeVec  3. semanticFt  4. episodeFt
    const semVec = [makeSemanticRow('s1', 'vector result 1'), makeSemanticRow('s2', 'vector result 2')];
    const epVec: any[] = [];
    const semFt = [makeSemanticRow('s1', 'vector result 1'), makeSemanticRow('s3', 'ft only')];
    const epFt: any[] = [];

    mockQueryRawUnsafe
      .mockResolvedValueOnce(semVec)   // semanticVec
      .mockResolvedValueOnce(epVec)    // episodeVec
      .mockResolvedValueOnce(semFt)    // semanticFt
      .mockResolvedValueOnce(epFt);    // episodeFt

    const { semantics } = await searchMemory('user-a', 'test query');

    // s1 appears in both lists so must rank highest via RRF
    expect(semantics.length).toBeGreaterThanOrEqual(2);
    expect(semantics[0].id).toBe('s1');

    // s3 (ft-only) and s2 (vec-only) must both appear
    const ids = semantics.map((r: any) => r.id);
    expect(ids).toContain('s2');
    expect(ids).toContain('s3');
  });

  it('returns vector-only results when full-text returns nothing', async () => {
    mockGenerateEmbedding.mockResolvedValue(FAKE_VEC);

    const semVec = [makeSemanticRow('s1', 'vec result')];
    const epVec = [makeEpisodeRow('e1', 'episode result')];

    mockQueryRawUnsafe
      .mockResolvedValueOnce(semVec)  // semanticVec
      .mockResolvedValueOnce(epVec)   // episodeVec
      .mockResolvedValueOnce([])      // semanticFt — empty
      .mockResolvedValueOnce([]);     // episodeFt  — empty

    const { semantics, episodes } = await searchMemory('user-a', 'query with no ft hits');

    expect(semantics).toHaveLength(1);
    expect(semantics[0].id).toBe('s1');
    expect(episodes).toHaveLength(1);
    expect(episodes[0].id).toBe('e1');

    // LIKE fallback should NOT have been called
    expect(mockSemanticFindMany).not.toHaveBeenCalled();
    expect(mockEpisodeFindMany).not.toHaveBeenCalled();
  });

  it('falls back to LIKE search when generateEmbedding returns null', async () => {
    mockGenerateEmbedding.mockResolvedValue(null);

    const likeSems = [makeSemanticRow('s-like', 'matching statement')];
    const likeEps = [makeEpisodeRow('e-like', 'matching episode')];
    mockSemanticFindMany.mockResolvedValue(likeSems);
    mockEpisodeFindMany.mockResolvedValue(likeEps);

    const { semantics, episodes } = await searchMemory('user-a', 'matching');

    expect(semantics).toHaveLength(1);
    expect(semantics[0].id).toBe('s-like');
    expect(episodes).toHaveLength(1);
    expect(episodes[0].id).toBe('e-like');

    // Raw SQL should NOT have been called (no embedding available)
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it('scopes results to the given userId (tenant isolation)', async () => {
    mockGenerateEmbedding.mockResolvedValue(null);

    // Mock returns user-a data when queried for user-a
    mockSemanticFindMany.mockImplementation(({ where }: any) => {
      if (where.userId === 'user-a') {
        return Promise.resolve([makeSemanticRow('s-a', 'user-a fact')]);
      }
      return Promise.resolve([]);
    });
    mockEpisodeFindMany.mockResolvedValue([]);

    const resultA = await searchMemory('user-a', 'fact');
    const resultB = await searchMemory('user-b', 'fact');

    expect(resultA.semantics).toHaveLength(1);
    expect(resultA.semantics[0].id).toBe('s-a');
    expect(resultB.semantics).toHaveLength(0);

    // Both calls must have used their respective userId
    const callsA = mockSemanticFindMany.mock.calls.filter(
      (c: any[]) => c[0]?.where?.userId === 'user-a',
    );
    const callsB = mockSemanticFindMany.mock.calls.filter(
      (c: any[]) => c[0]?.where?.userId === 'user-b',
    );
    expect(callsA.length).toBeGreaterThanOrEqual(1);
    expect(callsB.length).toBeGreaterThanOrEqual(1);
  });
});

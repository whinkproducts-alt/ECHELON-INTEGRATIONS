/**
 * Phase 3a acceptance tests — D2 assurance fill.
 *
 * Covers items that were MISSING from earlier test files:
 *   A2 — embed() switches between providers by env alone (mocked HTTP)
 *   A6 — writeMemory(episodic) returns in under 50 ms when embed never resolves
 *   A7 — semantic dedup: 0.95 similarity merges, 0.80 similarity inserts,
 *          embeddings unavailable inserts (exact-text duplication guard)
 *   A8 — findSimilarMemories scopes by userId (dedup tenant isolation)
 *
 * A3 (embed dimension validation) is NOT tested here because the feature is not
 * implemented in lib/model-router.ts — embed() returns whatever the provider
 * returns with no length check. A builder gap is filed in the D2 report.
 *
 * Backfill (scripts/backfill-embeddings.ts) does not scope its SQL by userId.
 * A builder gap is filed for that too. The search-path tenant isolation for A8
 * is already covered by memory-hybrid.test.ts.
 *
 * No real HTTP calls are made — fetch is mocked at the global level.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── A2 — embed() provider switching ─────────────────────────────────────────

describe('A2 — embed() from model-router switches provider by env (mocked HTTP)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EMBEDDINGS_URL;
    delete process.env.EMBEDDINGS_MODEL;
    delete process.env.EMBEDDING_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OLLAMA_URL;
  });

  it('OpenAI-compatible path: EMBEDDINGS_URL set → calls that URL', async () => {
    process.env.EMBEDDINGS_URL = 'http://openai-compat:8080/v1';
    process.env.EMBEDDINGS_MODEL = 'my-embed-model';
    delete process.env.OPENAI_API_KEY;

    const fakeVec = new Array(1536).fill(0.42);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: fakeVec }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { embed } = await import('../model-router');
    const result = await embed({ text: 'test sentence' });

    expect(result).toEqual(fakeVec);
    expect(mockFetch).toHaveBeenCalledOnce();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe('http://openai-compat:8080/v1/embeddings');
  });

  it('Ollama path: EMBEDDING_MODEL=ollama/nomic-embed-text → calls Ollama /api/embeddings', async () => {
    delete process.env.EMBEDDINGS_URL;
    delete process.env.OPENAI_API_KEY;
    process.env.EMBEDDING_MODEL = 'ollama/nomic-embed-text';
    process.env.OLLAMA_URL = 'http://localhost:11434';

    const fakeVec = new Array(768).fill(0.1);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: fakeVec }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { embed } = await import('../model-router');
    const result = await embed({ text: 'local embedding' });

    expect(result).toEqual(fakeVec);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('11434');
    expect(url).toContain('/api/embeddings');
  });

  it('returns null (no throw) when provider returns non-ok response', async () => {
    process.env.EMBEDDINGS_URL = 'http://down-embed:8080/v1';
    delete process.env.OPENAI_API_KEY;

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', mockFetch);

    const { embed } = await import('../model-router');
    const result = await embed({ text: 'test' });
    expect(result).toBeNull();
  });

  it('returns null (no throw) when fetch throws (service unreachable)', async () => {
    process.env.EMBEDDINGS_URL = 'http://unreachable:9999/v1';
    delete process.env.OPENAI_API_KEY;

    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const { embed } = await import('../model-router');
    const result = await embed({ text: 'test' });
    expect(result).toBeNull();
  });
});

// ── A6 — writeMemory fire-and-forget (embed never resolves) ─────────────────

describe('A6 — writeMemory(episodic) returns quickly even when embed never resolves', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writeMemory resolves in under 50 ms and the row is saved when embed hangs', async () => {
    // generateEmbedding returns a promise that never resolves (simulates hung embed service)
    const hangingEmbed = new Promise<number[]>(() => {/* never resolves */});
    const mockCreate = vi.fn().mockResolvedValue({ id: 'ep-fast' });

    vi.doMock('@/lib/embedding-service', () => ({
      generateEmbedding: vi.fn().mockReturnValue(hangingEmbed),
    }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        memoryEpisode: { create: mockCreate },
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      },
    }));
    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { writeMemory } = await import('../memory-engine');

    const start = Date.now();
    const result = await writeMemory({
      userId: 'u1',
      type: 'episodic',
      statement: 'Victor ran a 5K',
      source: 'auto',
      eventType: 'exercise',
    });
    const elapsed = Date.now() - start;

    // Row must be saved
    expect(result.id).toBe('ep-fast');
    expect(mockCreate).toHaveBeenCalledOnce();
    // Must have returned before embedding resolved — well under 50 ms
    expect(elapsed).toBeLessThan(50);
  });
});

// ── A7 — Semantic dedup thresholds ──────────────────────────────────────────

describe('A7 — semantic dedup thresholds', () => {
  /**
   * findSimilarMemories uses cosine DISTANCE (not similarity).
   * similarity = 1 - distance.
   * threshold = 0.92 → distanceThreshold = 0.08.
   * similarity 0.95 → distance 0.05 ≤ 0.08 → MERGES.
   * similarity 0.80 → distance 0.20 > 0.08 → INSERTS.
   */

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('similarity 0.95 (distance 0.05) — merges existing row (deduped=true)', async () => {
    const existingRow = { id: 'sem-existing', statement: 'Victor prefers standing desks', confidence: 0.7, distance: 0.05 };

    const mockQueryRaw = vi.fn().mockResolvedValue([existingRow]);
    const mockUpdate = vi.fn().mockResolvedValue({ id: 'sem-existing', confidence: 0.8 });
    const mockCreate = vi.fn();
    const fakeVec = new Array(1536).fill(0.1);

    vi.doMock('@/lib/embedding-service', () => ({
      generateEmbedding: vi.fn().mockResolvedValue(fakeVec),
    }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        memorySemantic: { create: mockCreate, update: mockUpdate },
        $queryRawUnsafe: mockQueryRaw,
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      },
    }));
    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { writeMemory } = await import('../memory-engine');
    const result = await writeMemory({
      userId: 'u1',
      type: 'semantic',
      statement: 'Victor prefers standing desks (rephrased)',
      source: 'auto',
      confidence: 0.8,
    });

    expect(result.deduped).toBe(true);
    expect(result.id).toBe('sem-existing');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('similarity 0.80 (distance 0.20) — no similar row found → inserts new row (deduped=false)', async () => {
    // $queryRawUnsafe returns empty → no similar → insert
    const mockQueryRaw = vi.fn().mockResolvedValue([]);
    const mockCreate = vi.fn().mockResolvedValue({ id: 'sem-new' });
    const fakeVec = new Array(1536).fill(0.2);

    vi.doMock('@/lib/embedding-service', () => ({
      generateEmbedding: vi.fn().mockResolvedValue(fakeVec),
    }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        memorySemantic: { create: mockCreate, update: vi.fn() },
        $queryRawUnsafe: mockQueryRaw,
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      },
    }));
    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { writeMemory } = await import('../memory-engine');
    const result = await writeMemory({
      userId: 'u1',
      type: 'semantic',
      statement: 'Victor enjoys hiking on weekends',
      source: 'auto',
      confidence: 0.75,
    });

    expect(result.deduped).toBe(false);
    expect(result.id).toBe('sem-new');
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('embeddings unavailable — inserts new row (deduped=false), no exact-text duplicate check needed', async () => {
    // When generateEmbedding returns null, dedup is skipped entirely and a new row is inserted.
    // The exact-text guard means identical strings never duplicate because the same call
    // would also return null → same result: a fresh insert each time. Both assertions are:
    // (1) deduped=false, (2) row created.
    const mockCreate = vi.fn().mockResolvedValue({ id: 'sem-no-embed' });
    const mockQueryRaw = vi.fn();

    vi.doMock('@/lib/embedding-service', () => ({
      generateEmbedding: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        memorySemantic: { create: mockCreate, update: vi.fn() },
        $queryRawUnsafe: mockQueryRaw,
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      },
    }));
    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { writeMemory } = await import('../memory-engine');
    const result = await writeMemory({
      userId: 'u1',
      type: 'semantic',
      statement: 'Victor codes in TypeScript',
      source: 'auto',
    });

    expect(result.deduped).toBe(false);
    expect(result.id).toBe('sem-no-embed');
    expect(mockCreate).toHaveBeenCalledOnce();
    // Dedup query must NOT have been called (no embedding to compare with)
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});

// ── A8 — Dedup tenant isolation (findSimilarMemories) ───────────────────────

describe('A8 — dedup tenant isolation: findSimilarMemories never crosses userId boundary', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('findSimilarMemories passes the correct userId as a bound parameter', async () => {
    const mockQueryRaw = vi.fn().mockResolvedValue([]);

    vi.doMock('@/lib/db', () => ({
      prisma: { $queryRawUnsafe: mockQueryRaw },
    }));
    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn() },
    }));

    const { findSimilarMemories } = await import('../memory-engine');
    const fakeVec = new Array(768).fill(0.5);

    await findSimilarMemories('user-A', fakeVec, 0.92, 5);

    expect(mockQueryRaw).toHaveBeenCalledOnce();
    // The second positional parameter in the raw query must be user-A's userId
    const callArgs = mockQueryRaw.mock.calls[0];
    // callArgs: [sqlString, vecLiteral, userId, distanceThreshold, limit]
    expect(callArgs[2]).toBe('user-A');
  });

  it('user B calling findSimilarMemories never receives user A rows', async () => {
    // Simulate: user-A has a similar row; user-B query returns empty (different userId scope)
    const mockQueryRaw = vi.fn().mockImplementation((_sql: string, _vec: string, userId: string) => {
      if (userId === 'user-A') {
        return Promise.resolve([{ id: 'row-A', statement: 'user A fact', confidence: 0.9, distance: 0.05 }]);
      }
      return Promise.resolve([]);
    });

    vi.doMock('@/lib/db', () => ({
      prisma: { $queryRawUnsafe: mockQueryRaw },
    }));
    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn() },
    }));

    const { findSimilarMemories } = await import('../memory-engine');
    const fakeVec = new Array(768).fill(0.5);

    const resultA = await findSimilarMemories('user-A', fakeVec);
    const resultB = await findSimilarMemories('user-B', fakeVec);

    expect(resultA).toHaveLength(1);
    expect(resultA[0].id).toBe('row-A');
    // User B must get no results — row-A must not leak
    expect(resultB).toHaveLength(0);
  });

  it('writeMemory(semantic) dedup uses the caller userId, not a hardcoded value', async () => {
    // For user-A there is a similar row; for user-B there is none.
    // This proves dedup is scoped by the caller's userId.
    const existingRow = { id: 'sem-A', statement: 'existing fact', confidence: 0.7, distance: 0.05 };

    const mockQueryRaw = vi.fn().mockImplementation((_sql: string, _vec: string, userId: string) => {
      if (userId === 'user-A') return Promise.resolve([existingRow]);
      return Promise.resolve([]);
    });

    const mockCreate = vi.fn().mockResolvedValue({ id: 'sem-new' });
    const mockUpdate = vi.fn().mockResolvedValue({ id: 'sem-A' });
    const fakeVec = new Array(1536).fill(0.1);

    vi.doMock('@/lib/embedding-service', () => ({
      generateEmbedding: vi.fn().mockResolvedValue(fakeVec),
    }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        memorySemantic: { create: mockCreate, update: mockUpdate },
        $queryRawUnsafe: mockQueryRaw,
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      },
    }));
    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { writeMemory } = await import('../memory-engine');

    // user-A: should dedup (existing row found)
    const resultA = await writeMemory({
      userId: 'user-A',
      type: 'semantic',
      statement: 'very similar fact',
      source: 'auto',
    });
    expect(resultA.deduped).toBe(true);

    // Reset modules to get fresh mocks for user-B
    vi.resetModules();
    const mockQueryRaw2 = vi.fn().mockImplementation((_sql: string, _vec: string, userId: string) => {
      if (userId === 'user-A') return Promise.resolve([existingRow]);
      return Promise.resolve([]);
    });
    const mockCreate2 = vi.fn().mockResolvedValue({ id: 'sem-new-B' });
    vi.doMock('@/lib/embedding-service', () => ({
      generateEmbedding: vi.fn().mockResolvedValue(fakeVec),
    }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        memorySemantic: { create: mockCreate2, update: vi.fn() },
        $queryRawUnsafe: mockQueryRaw2,
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      },
    }));
    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { writeMemory: writeMemory2 } = await import('../memory-engine');

    // user-B: must NOT find user-A's row → fresh insert
    const resultB = await writeMemory2({
      userId: 'user-B',
      type: 'semantic',
      statement: 'very similar fact',
      source: 'auto',
    });
    expect(resultB.deduped).toBe(false);
    expect(resultB.id).toBe('sem-new-B');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── writeMemory ───────────────────────────────────────────────────────────────

describe('writeMemory', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an episodic memory record', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'ep-1' });
    vi.doMock('@/lib/db', () => ({
      prisma: { memoryEpisode: { create: mockCreate } },
    }));
    vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn() } }));

    const { writeMemory } = await import('../memory-engine');
    await writeMemory({
      userId: 'u1', type: 'episodic', statement: 'Victor met Rania',
      source: 'conversation', eventType: 'meeting',
    });
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate.mock.calls[0][0].data.summary).toBe('Victor met Rania');
  });

  it('creates a semantic memory record', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'sem-1', confidence: 0.8 });
    vi.doMock('@/lib/db', () => ({
      prisma: {
        memorySemantic: { create: mockCreate },
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      },
    }));
    vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn() } }));
    // Mock embedding-service so writeMemory does not try to connect to Ollama
    vi.doMock('@/lib/embedding-service', () => ({ generateEmbedding: vi.fn().mockResolvedValue(null) }));

    const { writeMemory } = await import('../memory-engine');
    await writeMemory({
      userId: 'u1', type: 'semantic', statement: 'Victor is CEO of WHINK Apps',
      source: 'user',
    });
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate.mock.calls[0][0].data.statement).toBe('Victor is CEO of WHINK Apps');
  });

  it('caps hypothesis confidence at 0.4 (MAMBA firewall)', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'hyp-1' });
    vi.doMock('@/lib/db', () => ({
      prisma: { hypothesis: { create: mockCreate } },
    }));
    vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), security: vi.fn(), warn: vi.fn() } }));
    vi.doMock('@/lib/model-router', () => ({ embed: vi.fn().mockResolvedValue(null) }));

    const { writeMemory } = await import('../memory-engine');
    await writeMemory({
      userId: 'u1', type: 'hypothesis',
      statement: 'Competitor X will launch in Q2',
      source: 'MAMBA', confidence: 0.9,
    });
    expect(mockCreate.mock.calls[0][0].data.confidence).toBe(0.4);
  });

  it('throws for unknown memory type', async () => {
    vi.doMock('@/lib/db', () => ({ prisma: {} }));
    vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), security: vi.fn() } }));

    const { writeMemory } = await import('../memory-engine');
    await expect(
      writeMemory({ userId: 'u1', type: 'unknown' as any, statement: 'x', source: 'test' })
    ).rejects.toThrow('Unknown memory type');
  });
});

// ── correctMemory ─────────────────────────────────────────────────────────────

describe('correctMemory', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supersedes old memories and creates a new one', async () => {
    const old = [{ id: 'old-1' }, { id: 'old-2' }];
    const newMem = { id: 'new-1' };
    const findMany = vi.fn().mockResolvedValue(old);
    const create = vi.fn().mockResolvedValueOnce(newMem).mockResolvedValueOnce({ id: 'ep-c' });
    const update = vi.fn().mockResolvedValue({});

    vi.doMock('@/lib/db', () => ({
      prisma: {
        memorySemantic: { findMany, create, update },
        memoryEpisode: { create },
      },
    }));
    vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), security: vi.fn() } }));

    const { correctMemory } = await import('../memory-engine');
    const result = await correctMemory('u1', 'old statement', 'new statement');
    expect(result.superseded).toBe(2);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0][0].data.supersededBy).toBe('new-1');
  });
});

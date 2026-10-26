import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ sem: [] as Array<Record<string, unknown>>, ledger: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/db', () => ({
  prisma: {
    memorySemantic: { findMany: async () => h.sem },
    memoryEpisode: { findMany: async () => [] },
    entityNode: { findMany: async () => [] },
    hypothesis: { findMany: async () => [] },
    project: { findFirst: async () => null },
    documentWorkspace: { findUnique: async () => null },
  },
}));
vi.mock('@/lib/working-memory', () => ({ listWorkingMemory: async () => [] }));
vi.mock('@/lib/memory-engine', () => ({ searchMemory: async () => ({ semantics: h.sem, episodes: [], hypotheses: [] }) }));
vi.mock('@/lib/anythingllm-client', () => ({ queryDocuments: async () => [] }));
vi.mock('@/lib/ledger', () => ({
  recordActionSafe: async (e: Record<string, unknown>) => { h.ledger.push(e); return { id: 'x' }; },
  recordAction: async () => ({ id: 'x' }),
}));

import { assembleContext } from '@/lib/context-engine';
import { extractAndStoreMemories } from '@/lib/auto-memory';

const mem = (sourceType: string) => ({ id: 'm1', statement: 'a fact', epistemicStatus: 'INFERRED', confidence: 0.6, sourceType });

beforeEach(() => { h.sem = []; h.ledger = []; });

describe('recalled outsider memory taints the turn', () => {
  for (const st of ['skill_upload', 'news', 'swarm']) {
    for (const query of ['what do I know', undefined]) {
      it(`${st} (${query ? 'query path' : 'recency path'}) sets externalContentThisTurn`, async () => {
        h.sem = [mem(st)];
        const ctx = await assembleContext('u1', 'c1', null, 'corr', query);
        expect(ctx.semanticMemories.length).toBe(1);
        expect(ctx.externalContentThisTurn).toBe(true);
      });
    }
  }
  it('an ordinary user memory does not taint', async () => {
    h.sem = [mem('user')];
    expect((await assembleContext('u1', 'c1', null, 'corr', 'q')).externalContentThisTurn).toBe(false);
  });
  it('skill memory is labelled as an uploaded skill (untrusted reference)', async () => {
    h.sem = [mem('skill_upload')];
    const ctx = await assembleContext('u1', 'c1', null, 'corr', 'q');
    expect(ctx.semanticMemories[0]).toContain('source="uploaded skill (untrusted reference)"');
  });
  it('a tainted turn is skipped by auto extraction with a ledgered reason', async () => {
    h.sem = [mem('skill_upload')];
    const ctx = await assembleContext('u1', 'c1', null, 'corr', 'q');
    await extractAndStoreMemories({
      userId: 'u1', conversationId: 'c1', userMessage: 'hi', assistantReply: 'x'.repeat(200),
      persona: 'WHINK', correlationId: 'corr', conversationTainted: ctx.externalContentThisTurn,
    });
    const skipped = h.ledger.find((l) => l.action === 'memory_auto_skipped');
    expect(skipped).toBeTruthy();
    expect(String(skipped!.inputSummary ?? skipped!.outputSummary ?? '')).toMatch(/\S/);
  });
});

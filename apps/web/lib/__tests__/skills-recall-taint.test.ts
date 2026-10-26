import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ epi: [] as Array<Record<string, any>>, hyp: [] as Array<Record<string, any>>, sem: [] as Array<Record<string, unknown>>, ledger: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/db', () => ({
  prisma: {
    memorySemantic: { findMany: async () => h.sem },
    memoryEpisode: { findMany: async () => h.epi },
    entityNode: { findMany: async () => [] },
    hypothesis: { findMany: async () => h.hyp },
    project: { findFirst: async () => null },
    documentWorkspace: { findUnique: async () => null },
  },
}));
vi.mock('@/lib/working-memory', () => ({ listWorkingMemory: async () => [] }));
vi.mock('@/lib/memory-engine', () => ({ searchMemory: async () => ({ semantics: h.sem, episodes: h.epi, hypotheses: h.hyp }) }));
vi.mock('@/lib/anythingllm-client', () => ({ queryDocuments: async () => [] }));
vi.mock('@/lib/ledger', () => ({
  recordActionSafe: async (e: Record<string, unknown>) => { h.ledger.push(e); return { id: 'x' }; },
  recordAction: async () => ({ id: 'x' }),
}));

import { assembleContext } from '@/lib/context-engine';
import { extractAndStoreMemories } from '@/lib/auto-memory';

const ep = (source: string | undefined) => ({ id: 'e1', summary: 'an event', eventType: 'swarm_report', source, createdAt: new Date() });
const mem = (sourceType: string) => ({ id: 'm1', statement: 'a fact', epistemicStatus: 'INFERRED', confidence: 0.6, sourceType });

beforeEach(() => { h.sem = []; h.epi = []; h.hyp = []; h.ledger = []; });

describe('allow-list: any recalled memory from an untrusted source taints the turn', () => {
  for (const query of ['q', undefined]) {
    const path = query ? 'query path' : 'recency path';
    for (const src of ['swarm', 'worker_brief', 'news', 'brand_new_source_2027']) {
      it(`episode from ${src} taints (${path})`, async () => {
        h.epi = [ep(src)];
        const ctx = await assembleContext('u1', 'c1', null, 'corr', query);
        expect(ctx.episodicMemories.length).toBe(1);
        expect(ctx.externalContentThisTurn).toBe(true);
      });
    }
    it(`semantic worker_brief and unknown sources taint (${path})`, async () => {
      for (const st of ['worker_brief', 'something_new']) {
        h.sem = [mem(st)];
        expect((await assembleContext('u1', 'c1', null, 'corr', query)).externalContentThisTurn).toBe(true);
      }
    });
    it(`hypothesis from an unknown source taints, MAMBA does not (${path})`, async () => {
      h.hyp = [{ id: 'h1', statement: 's', confidence: 0.3, source: 'worker_brief' }];
      expect((await assembleContext('u1', 'c1', null, 'corr', query)).externalContentThisTurn).toBe(true);
      h.hyp = [{ id: 'h1', statement: 's', confidence: 0.3, source: 'MAMBA' }];
      expect((await assembleContext('u1', 'c1', null, 'corr', query)).externalContentThisTurn).toBe(false);
    });
    it(`trusted sources do not taint (${path})`, async () => {
      for (const src of ['user', 'correction', 'auto', 'manual']) {
        h.sem = [mem(src)]; h.epi = [ep(src)];
        expect((await assembleContext('u1', 'c1', null, 'corr', query)).externalContentThisTurn).toBe(false);
      }
    });
  }
});

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

/**
 * E3 Gap 3 — conversationTainted propagates from working memory through messages route
 *
 * When a prior turn was injection-blocked, the route stores a taint key in working memory.
 * On the next turn, the route reads that key and passes conversationTainted:true to runToolLoop,
 * so Class A/B tools that persist or send data outward are upgraded to Class C for the entire run.
 *
 * This test constructs a scenario where getWorkingMemory returns a non-empty value for the
 * taint key, then asserts runToolLoop is called with { conversationTainted: true }.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('messages route: conversationTainted propagates from working memory', () => {
  const runToolLoop = vi.fn();
  const chatOnce = vi.fn();
  const recordActionSafe = vi.fn();
  const writeMemory = vi.fn();
  const getWorkingMemory = vi.fn();
  const setWorkingMemory = vi.fn();

  function sse(events: object[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
      start(c) {
        for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        c.close();
      },
    });
  }

  beforeEach(() => {
    vi.resetModules();
    runToolLoop.mockReset();
    chatOnce.mockReset().mockResolvedValue('[]');
    recordActionSafe.mockReset().mockResolvedValue({ id: 'a1' });
    writeMemory.mockReset();
    getWorkingMemory.mockReset();
    setWorkingMemory.mockReset().mockResolvedValue(undefined);

    vi.doMock('next/server', () => ({
      NextRequest: class {},
      NextResponse: {
        json: (b: unknown, init?: { status?: number }) =>
          new Response(JSON.stringify(b), { status: init?.status ?? 200 }),
      },
    }));
    vi.doMock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        conversation: {
          findFirst: vi.fn().mockResolvedValue({ id: 'c1', userId: 'u1', projectId: null }),
          update: vi.fn(),
        },
        message: {
          create: vi.fn().mockResolvedValue({ id: 'saved-message', createdAt: new Date() }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        personaState: { findUnique: vi.fn().mockResolvedValue(null) },
        userPreference: { findUnique: vi.fn().mockResolvedValue(null) },
        userApiKey: { findUnique: vi.fn().mockResolvedValue(null) },
        memorySemantic: { findMany: vi.fn().mockResolvedValue([]) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1' }) },
      },
    }));
    vi.doMock('@/lib/orchestrator', () => ({
      processInput: vi.fn().mockResolvedValue({
        personaSwitched: false,
        newPersona: 'WHINK',
        newMambaMode: null,
        functionalMode: null,
        systemPrompt: 'test-system-prompt',
        metaAuthViolation: false,
        metaAuthBlocked: false,
        injectionDetected: false,
        injectionBlocked: false,
        injectionPatterns: [],
      }),
      debriefTurn: vi.fn(),
    }));
    vi.doMock('@/lib/tool-loop', () => ({
      runToolLoop,
      STANDARD_TOOLS: [],
      isExternalTool: (n: string) =>
        ['web_fetch', 'web_search', 'document_search'].includes(n) || n.startsWith('openclaw__'),
    }));
    vi.doMock('@/lib/model-router', () => ({ chatOnce }));
    vi.doMock('@/lib/task-gate', () => ({
      runTaskGate: vi.fn().mockReturnValue({ intercepted: false }),
    }));
    vi.doMock('@/lib/approval-handler', () => ({
      isApprovalMessage: vi.fn().mockReturnValue(false),
      BARE_APPROVAL_REPLY: 'x',
    }));
    vi.doMock('@/lib/approvals', () => ({ createApproval: vi.fn() }));
    vi.doMock('@/lib/memory-engine', () => ({ writeMemory }));
    vi.doMock('@/lib/key-encryption', () => ({ decryptKey: vi.fn() }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe }));
    vi.doMock('@/lib/gateway-chat', () => ({
      resolveChatTools: vi.fn(async (o: { standardTools: unknown[] }) => o.standardTools),
    }));
    vi.doMock('@/lib/working-memory', () => ({
      getWorkingMemory,
      setWorkingMemory,
    }));
    vi.doMock('@/lib/project-access', () => ({
      hasProjectId: () => false,
      assertOwnedProject: vi.fn(),
    }));
  });

  async function run() {
    const { POST } = await import('../../app/api/conversations/[id]/messages/route');
    const res = await POST(
      { json: async () => ({ message: 'what is the plan' }) } as never,
      { params: Promise.resolve({ id: 'c1' }) }
    );
    await res.text();
    await new Promise((r) => setTimeout(r, 30));
  }

  it('passes conversationTainted:true when working memory has taint key for this conversation', async () => {
    // Simulate a prior injection-blocked turn: working memory has a taint key set for c1.
    getWorkingMemory.mockResolvedValue(new Date().toISOString());

    runToolLoop.mockResolvedValue(
      sse([
        { type: 'text', content: 'Here is the plan.' },
        { type: 'done' },
      ])
    );

    await run();

    expect(runToolLoop).toHaveBeenCalledTimes(1);
    const callArgs = runToolLoop.mock.calls[0][0];
    expect(callArgs).toMatchObject({ conversationTainted: true });
  });

  it('passes conversationTainted:false when working memory has no taint key for this conversation', async () => {
    // No prior injection-blocked turn: getWorkingMemory returns null/undefined.
    getWorkingMemory.mockResolvedValue(null);

    runToolLoop.mockResolvedValue(
      sse([
        { type: 'text', content: 'No taint here.' },
        { type: 'done' },
      ])
    );

    await run();

    expect(runToolLoop).toHaveBeenCalledTimes(1);
    const callArgs = runToolLoop.mock.calls[0][0];
    expect(callArgs).toMatchObject({ conversationTainted: false });
  });

  it('still calls runToolLoop even when getWorkingMemory throws', async () => {
    // Working memory failure is non-blocking; the route catches and defaults to false.
    getWorkingMemory.mockRejectedValue(new Error('redis down'));

    runToolLoop.mockResolvedValue(
      sse([
        { type: 'text', content: 'Resilient.' },
        { type: 'done' },
      ])
    );

    await run();

    expect(runToolLoop).toHaveBeenCalledTimes(1);
    // On error, taint defaults to false (non-blocking path)
    const callArgs = runToolLoop.mock.calls[0][0];
    expect(callArgs).toMatchObject({ conversationTainted: false });
  });
});

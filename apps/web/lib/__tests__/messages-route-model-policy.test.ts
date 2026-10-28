/**
 * (copy of the taint test setup, used here for the model policy)
 * E3 Gap 3 — conversationTainted propagates from working memory through messages route
 *
 * When a prior turn was injection-blocked, the route stores a taint key in working memory.
 * On the next turn, the route reads that key and passes conversationTainted:true to runToolLoop,
 * so Class A/B tools that persist or send data outward are upgraded to Class C for the entire run.
 *
 * This test constructs a scenario where getWorkingMemory returns a non-empty value for the
 * taint key, then asserts runToolLoop is called with { conversationTainted: true }.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('messages route: requested model is checked against the allow-list', () => {
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
          create: vi.fn(),
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


  const userApiKeyFind = vi.fn();
  const messageFindMany = vi.fn();

  async function run(body: Record<string, unknown>) {
    vi.doMock('@/lib/db', () => ({
      prisma: {
        conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', userId: 'u1', projectId: null }), update: vi.fn() },
        message: { create: vi.fn(), findMany: messageFindMany },
        personaState: { findUnique: vi.fn().mockResolvedValue(null) },
        userPreference: { findUnique: vi.fn().mockResolvedValue(null) },
        userApiKey: { findUnique: userApiKeyFind },
        memorySemantic: { findMany: vi.fn().mockResolvedValue([]) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1' }) },
      },
    }));
    runToolLoop.mockResolvedValue(sse([{ type: 'text', content: 'ok' }, { type: 'done' }]));
    getWorkingMemory.mockResolvedValue(null);
    const { POST } = await import('../../app/api/conversations/[id]/messages/route');
    const res = await POST({ json: async () => ({ message: 'hi', ...body }) } as never, { params: Promise.resolve({ id: 'c1' }) });
    await res.text();
    await new Promise((r) => setTimeout(r, 30));
    return runToolLoop.mock.calls[0][0];
  }

  const savedEnv = { DEFAULT_MODEL: process.env.DEFAULT_MODEL, WHINK_ALLOWED_MODELS: process.env.WHINK_ALLOWED_MODELS };
  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  beforeEach(() => {
    process.env.DEFAULT_MODEL = 'llama3.1:8b';
    delete process.env.WHINK_ALLOWED_MODELS;
    userApiKeyFind.mockReset().mockResolvedValue(null);
    messageFindMany.mockReset().mockResolvedValue([]);
    vi.doMock('@/lib/key-encryption', () => ({ decryptKey: vi.fn(() => 'user-own-key') }));
  });

  it('a listed model is used as asked', async () => {
    const args = await run({ model: 'claude-sonnet-4-5' });
    expect(args.model).toBe('claude-sonnet-4-5');
  });

  it('an unlisted expensive model falls back to the default and is ledgered, without the server key being offered', async () => {
    const args = await run({ model: 'claude-opus-9-9-secret' });
    expect(args.model).toBe('llama3.1:8b');
    expect(args.apiKey).toBeUndefined();
    const rows = recordActionSafe.mock.calls.map((c) => c[0]);
    expect(rows.some((r) => r.action === 'model_not_allowed' && r.status === 'DENIED' && r.userId === 'u1')).toBe(true);
  });

  it('an unlisted model is allowed when the user has their own key for that provider', async () => {
    userApiKeyFind.mockResolvedValue({ encryptedKey: 'enc' });
    const args = await run({ model: 'claude-future-model' });
    expect(args.model).toBe('claude-future-model');
    expect(args.apiKey).toBe('user-own-key');
  });

  it('a malformed model value is ignored (default used) and does not crash', async () => {
    const args = await run({ model: { $ne: 1 } });
    expect(args.model).toBe('llama3.1:8b');
  });

  it('F5: conversation history is read with the signed-in user scope as well as the conversation id', async () => {
    await run({});
    expect(messageFindMany).toHaveBeenCalled();
    const where = messageFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ conversationId: 'c1', conversation: { userId: 'u1' } });
  });

  it('Local-Only: a cloud model (even with the user key) is replaced by the local model and ledgered with reason local_only', async () => {
    process.env.WHINK_LOCAL_ONLY = 'true';
    process.env.WHINK_LOCAL_MODEL = 'gemma3:4b';
    userApiKeyFind.mockResolvedValue({ encryptedKey: 'enc' });
    try {
      const args = await run({ model: 'claude-future-model' });
      expect(args.model).toBe('gemma3:4b');
      expect(args.apiKey).toBeUndefined();
      const rows = recordActionSafe.mock.calls.map((c) => c[0]);
      expect(rows.some((r) => r.action === 'model_not_allowed' && r.status === 'DENIED' && /local_only/.test(r.inputSummary))).toBe(true);
    } finally {
      delete process.env.WHINK_LOCAL_ONLY;
      delete process.env.WHINK_LOCAL_MODEL;
    }
  });

  it('Local-Only: a local model is used as asked and nothing is ledgered', async () => {
    process.env.WHINK_LOCAL_ONLY = 'true';
    try {
      const args = await run({ model: 'llama3.1:8b' });
      expect(args.model).toBe('llama3.1:8b');
      expect(recordActionSafe.mock.calls.some((c) => c[0].action === 'model_not_allowed')).toBe(false);
    } finally {
      delete process.env.WHINK_LOCAL_ONLY;
    }
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** M3: turns that read external content must not auto-extract memory or put reply text in the ledger. */
describe('messages route: external content read this turn', () => {
  const runToolLoop = vi.fn();
  const extractAndStoreMemories = vi.fn();
  const recordActionSafe = vi.fn();
  const LONG = 'The DM said something long enough to be worth remembering by an auto extractor. '.repeat(3);

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
    extractAndStoreMemories.mockReset().mockResolvedValue(undefined);
    recordActionSafe.mockReset();
    vi.doMock('next/server', () => ({
      NextRequest: class {},
      NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
    }));
    vi.doMock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', userId: 'u1', projectId: null }), update: vi.fn() },
        message: { create: vi.fn().mockResolvedValue({ id: 'msg-1' }), findMany: vi.fn().mockResolvedValue([]) },
        personaState: { findUnique: vi.fn() },
        userPreference: { findUnique: vi.fn().mockResolvedValue(null) },
        userApiKey: { findUnique: vi.fn().mockResolvedValue(null) },
      },
    }));
    vi.doMock('@/lib/orchestrator', () => ({
      processInput: vi.fn().mockResolvedValue({
        personaSwitched: false, newPersona: 'WHINK', newMambaMode: null, functionalMode: null, systemPrompt: '',
        metaAuthViolation: false, metaAuthBlocked: false, injectionDetected: false, injectionBlocked: false, injectionPatterns: [],
      }),
      debriefTurn: vi.fn(),
    }));
    vi.doMock('@/lib/tool-loop', () => ({
      runToolLoop,
      STANDARD_TOOLS: [],
      isExternalTool: (n: string) => ['web_fetch', 'web_search', 'document_search'].includes(n) || n.startsWith('openclaw__'),
    }));
    vi.doMock('@/lib/auto-memory', () => ({ extractAndStoreMemories }));
    vi.doMock('@/lib/task-gate', () => ({ runTaskGate: vi.fn().mockReturnValue({ intercepted: false }) }));
    vi.doMock('@/lib/approval-handler', () => ({ isApprovalMessage: vi.fn().mockReturnValue(false), BARE_APPROVAL_REPLY: 'x' }));
    vi.doMock('@/lib/approvals', () => ({ createApproval: vi.fn() }));
    vi.doMock('@/lib/key-encryption', () => ({ decryptKey: vi.fn() }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe }));
    vi.doMock('@/lib/gateway-chat', () => ({ resolveChatTools: vi.fn(async (o: { standardTools: unknown[] }) => o.standardTools) }));
    vi.doMock('@/lib/permission-engine', () => ({
      checkPermission: vi.fn().mockResolvedValue({ allowed: true, method: 'auto' }),
      checkMetaAuthorization: vi.fn().mockReturnValue(false),
    }));
    vi.doMock('@/lib/working-memory', () => ({
      setWorkingMemory: vi.fn().mockResolvedValue(undefined),
      getWorkingMemory: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock('@/lib/project-access', () => ({
      assertOwnedProject: vi.fn().mockResolvedValue(null),
      hasProjectId: vi.fn().mockReturnValue(false),
    }));
    vi.doMock('@/lib/types', () => ({ normaliseMambaMode: vi.fn().mockReturnValue(null) }));
  });

  async function run() {
    const { POST } = await import('../../app/api/conversations/[id]/messages/route');
    const res = await POST({ json: async () => ({ message: 'what is new' }) } as never, { params: Promise.resolve({ id: 'c1' }) });
    await res.text();
    await new Promise((r) => setTimeout(r, 30));
  }

  it('skips auto memory extraction and withholds reply text from the ledger after a social read', async () => {
    runToolLoop.mockResolvedValue(sse([
      { type: 'tool_call', tool: 'openclaw__x__read_dms', input: {} },
      { type: 'tool_result', tool: 'openclaw__x__read_dms', success: true },
      { type: 'text', content: LONG },
      { type: 'done' },
    ]));
    await run();
    // External read → extractAndStoreMemories must NOT be called
    expect(extractAndStoreMemories).not.toHaveBeenCalled();
    const row = recordActionSafe.mock.calls.map((c: any[]) => c[0]).find((r: any) => r.action === 'conversation_response');
    expect(row.outputSummary).not.toContain('DM said');
    expect(row.outputSummary).toMatch(/withheld/);
  });

  it('control: a turn with no external read still calls extractAndStoreMemories and ledgers the reply', async () => {
    runToolLoop.mockResolvedValue(sse([
      { type: 'text', content: LONG },
      { type: 'done' },
    ]));
    await run();
    expect(extractAndStoreMemories).toHaveBeenCalledTimes(1);
    const row = recordActionSafe.mock.calls.map((c: any[]) => c[0]).find((r: any) => r.action === 'conversation_response');
    expect(row.outputSummary).toContain('DM said');
  });
});

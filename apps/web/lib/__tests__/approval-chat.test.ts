import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('B2: bare chat approval approves nothing', () => {
  const decide = vi.fn();
  const runToolLoop = vi.fn();
  const messageCreate = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    decide.mockReset(); runToolLoop.mockReset(); messageCreate.mockReset();
    vi.doMock('next/server', () => ({
      NextRequest: class {},
      NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
    }));
    vi.doMock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', userId: 'u1', projectId: null }), update: vi.fn() },
        message: { create: messageCreate, findMany: vi.fn().mockResolvedValue([]) },
        personaState: { findUnique: vi.fn() },
      },
    }));
    vi.doMock('@/lib/orchestrator', () => ({
      processInput: vi.fn().mockResolvedValue({
        personaSwitched: false, newPersona: 'WHINK', newMambaMode: null, functionalMode: null, systemPrompt: '',
        metaAuthViolation: false, metaAuthBlocked: false, injectionDetected: false, injectionBlocked: false, injectionPatterns: [],
      }),
      debriefTurn: vi.fn(),
    }));
    vi.doMock('@/lib/tool-loop', () => ({ runToolLoop, STANDARD_TOOLS: [] }));
    vi.doMock('@/lib/model-router', () => ({ chatOnce: vi.fn() }));
    vi.doMock('@/lib/task-gate', () => ({ runTaskGate: vi.fn() }));
    vi.doMock('@/lib/approvals', () => ({ createApproval: vi.fn(), decide }));
    vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn() }));
    vi.doMock('@/lib/key-encryption', () => ({ decryptKey: vi.fn() }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe: vi.fn() }));
    vi.doMock('@/lib/gateway-chat', () => ({ resolveChatTools: vi.fn(async (o: { standardTools: unknown[] }) => o.standardTools) }));
  });

  it.each(['approved', 'Go ahead', 'proceed', 'yes, approved'])('"%s" gets the card pointer and decides nothing', async (msg) => {
    const { POST } = await import('../../app/api/conversations/[id]/messages/route');
    const res = await POST({ json: async () => ({ message: msg }) } as never, { params: Promise.resolve({ id: 'c1' }) });
    const events = (await res.text()).split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
    expect(events[0].content).toContain('nothing was approved from chat');
    expect(decide).not.toHaveBeenCalled();
    expect(runToolLoop).not.toHaveBeenCalled();
  });

  it('approval-handler no longer exports any executing handler', async () => {
    const mod = await import('../approval-handler');
    expect(Object.keys(mod).sort()).toEqual(['BARE_APPROVAL_REPLY', 'buildDispatchMessage', 'isApprovalMessage']);
  });
});

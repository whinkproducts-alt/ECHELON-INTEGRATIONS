/**
 * D3 on the live chat path: when a social tool runs inside a chat turn, the stored token is absent
 * from (1) the SSE stream the messages route returns, (2) every request body sent to the model
 * (model context), (3) every ledger payload, (4) console output.
 *
 * Real: messages route, resolveChatTools, tool loop, tool registry, permission engine, class map,
 * key encryption, social credential loading. Mocked at the boundary: session, db, ledger (captured),
 * MCP gateway client, the model provider (global fetch, OpenAI-compatible), orchestrator, approvals.
 * The test asserts the token DID reach the gateway call option, so the absence checks are meaningful.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitiseToolDefinition } from '@/lib/tool-definition';
import { encryptKey } from '@/lib/key-encryption';
import { SOCIAL_TOOL_DEFS } from './fixtures/social-tool-defs';

vi.mock('@/lib/model-router/dispatch', () => ({
  admittedCall: async (_scope: unknown, run: () => Promise<unknown>) => run(),
  admittedChatOnce: async (_scope: unknown, opts: unknown) => {
    const { chatOnce } = await import('@/lib/model-router');
    return chatOnce(opts as never);
  },
  reserveDispatch: async () => ({ id: 'test', attemptKey: 'k0000001', userId: 'u1', reservedTokens: 1, reservedMicros: 0 }),
  settleDispatch: async () => undefined,
  holdDispatch: async () => undefined,
  releaseDispatch: async () => undefined,
  runAdmittedVoice: async (_i: unknown, run: () => Promise<unknown>) => run(),
  DispatchBlockedError: class extends Error {},
}));


const ACCESS = 'AT-sse-plain-9f8e7d6c';
const REFRESH = 'RT-sse-plain-1a2b3c4d';

const callOpenClawTool = vi.fn();
const createApproval = vi.fn();
const recordAction = vi.fn();
const recordActionSafe = vi.fn();
const fetchMock = vi.fn();
const logged: string[] = [];

const advertised = SOCIAL_TOOL_DEFS.map((t) => {
  const c = sanitiseToolDefinition({ description: t.description, inputSchema: t.inputSchema });
  if (!c.ok) throw new Error('fixture rejected');
  return { name: t.name, description: c.definition.description, inputSchema: c.definition.inputSchema };
});

const jsonRes = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const toolCalls = (...calls: Array<[string, string, object]>) =>
  jsonRes({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: calls.map(([id, name, args]) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })) } }] });
const stop = (text: string) => jsonRes({ choices: [{ finish_reason: 'stop', message: { content: text } }] });

async function post(message: string): Promise<{ raw: string; events: Array<Record<string, unknown>> }> {
  vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u2' } }) }));
  vi.doMock('@/lib/openclaw-client', () => ({ isGatewayConfigured: () => true, listOpenClawTools: vi.fn(async () => advertised), callOpenClawTool }));
  vi.doMock('@/lib/db', () => ({
    prisma: {
      conversation: { findFirst: vi.fn(async () => ({ id: 'c1', userId: 'u2', projectId: null })), update: vi.fn() },
      message: { create: vi.fn().mockResolvedValue({ id: 'saved-message', createdAt: new Date() }), findMany: vi.fn(async () => []) },
      personaState: { findUnique: vi.fn(async () => null) },
      userPreference: { findUnique: vi.fn(async () => null) },
      userApiKey: { findUnique: vi.fn(async () => null) },
      memorySemantic: { findMany: vi.fn(async () => []) },
      userProfile: { findUnique: vi.fn(async () => ({ autonomyLevel: 5 })) },
      delegation: { findFirst: vi.fn(async () => ({ id: 'd1', isActive: true })) },
      socialConnection: {
        findFirst: vi.fn(async () => ({
          id: 'c1', userId: 'u2', platform: 'x', status: 'active', accessTokenEnc: encryptKey(ACCESS), refreshTokenEnc: encryptKey(REFRESH),
          expiresAt: new Date(Date.now() + 3600_000), platformUserId: '42', platformHandle: 'h', scopes: 'tweet.read', createdAt: new Date(),
        })),
        count: vi.fn(async () => 1),
        updateMany: vi.fn(),
      },
      approvalRequest: { findFirst: vi.fn(), updateMany: vi.fn() },
      scheduledPost: { count: vi.fn(async () => 0) },
    },
  }));
  vi.doMock('@/lib/orchestrator', () => ({
    processInput: vi.fn(async () => ({
      personaSwitched: false, newPersona: 'WHINK', newMambaMode: null, functionalMode: null, systemPrompt: 'sys',
      metaAuthViolation: false, metaAuthBlocked: false, injectionDetected: false, injectionBlocked: false, injectionPatterns: [],
    })),
    debriefTurn: vi.fn(),
  }));
  vi.doMock('@/lib/task-gate', () => ({ runTaskGate: () => ({ intercepted: false }) }));
  vi.doMock('@/lib/approval-handler', () => ({ isApprovalMessage: () => false, BARE_APPROVAL_REPLY: 'x' }));
  vi.doMock('@/lib/approvals', () => ({ createApproval }));
  vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn(), correctMemory: vi.fn(), searchMemory: vi.fn() }));
  vi.doMock('@/lib/ledger', () => ({ recordAction, recordActionSafe, updateActionStatus: vi.fn(), countToolExecutions: vi.fn(async () => 0) }));
  const { POST } = await import('../../app/api/conversations/[id]/messages/route');
  const res = await POST({ json: async () => ({ message }) } as never, { params: Promise.resolve({ id: 'c1' }) });
  const raw = await res.text();
  await new Promise((r) => setTimeout(r, 30));
  const events = raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
  return { raw, events };
}

const modelBodies = () => fetchMock.mock.calls.map((c) => String((c[1] as RequestInit | undefined)?.body ?? ''));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock.mockReset(); // leftover queued responses from an earlier test must not leak
  callOpenClawTool.mockReset();
  logged.length = 0;
  process.env.OPENCLAW_ALLOWED_USER_IDS = 'owner-only';
  process.env.ENCRYPTION_KEY = 'c'.repeat(64);
  process.env.DEFAULT_MODEL = 'llama3.1:8b';
  callOpenClawTool.mockResolvedValue('{"data":[{"id":"1","text":"a mention"}]}');
  createApproval.mockResolvedValue({ id: 'ap1', kind: 'tool_call', status: 'PENDING' });
  recordAction.mockResolvedValue({ id: 'a1' });
  recordActionSafe.mockResolvedValue({ id: 'a1' });
  vi.stubGlobal('fetch', fetchMock);
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logged.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.OPENCLAW_ALLOWED_USER_IDS;
});

describe('D3: social tokens never appear on the chat path', () => {
  it('a read and a write in one turn: token only in the gateway call option; absent from SSE, model context, ledger and logs', async () => {
    fetchMock
      .mockResolvedValueOnce(toolCalls(['t1', 'openclaw__x__read_mentions', { max_results: 5 }], ['t2', 'openclaw__x__post', { text: 'hello' }]))
      .mockResolvedValueOnce(stop('Read your mentions; the post is waiting for your approval.'));
    const { raw, events } = await post('check my mentions and post hello');

    // The tool really ran with the token (so the absence checks below mean something).
    expect(callOpenClawTool).toHaveBeenCalledTimes(1);
    expect(callOpenClawTool.mock.calls[0][0]).toBe('x__read_mentions');
    expect(JSON.stringify(callOpenClawTool.mock.calls[0][1])).not.toContain(ACCESS);
    expect(String((callOpenClawTool.mock.calls[0][2] as { credential?: string }).credential)).toContain(ACCESS);
    // The write was queued, not run.
    expect(createApproval).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['tool_call', 'tool_result', 'approval_required', 'done']));

    for (const secret of [ACCESS, REFRESH]) {
      expect(raw, 'SSE stream').not.toContain(secret);
      for (const b of modelBodies()) expect(b, 'model request body').not.toContain(secret);
      expect(JSON.stringify(recordAction.mock.calls) + JSON.stringify(recordActionSafe.mock.calls), 'ledger').not.toContain(secret);
      expect(JSON.stringify(createApproval.mock.calls), 'approval').not.toContain(secret);
      expect(logged.join('\n'), 'console').not.toContain(secret);
    }
    // The model was offered the social tools.
    expect(modelBodies()[0]).toContain('openclaw__x__read_mentions');
  });

  it('a read-only turn: the read result goes back to the model as context, still without the token', async () => {
    fetchMock
      .mockResolvedValueOnce(toolCalls(['t1', 'openclaw__x__read_mentions', { max_results: 5 }]))
      .mockResolvedValueOnce(stop('You have one mention.'));
    const { raw } = await post('check my mentions');
    expect(callOpenClawTool).toHaveBeenCalledTimes(1);
    expect(String((callOpenClawTool.mock.calls[0][2] as { credential?: string }).credential)).toContain(ACCESS);
    expect(modelBodies()).toHaveLength(2);
    expect(modelBodies()[1]).toContain('a mention'); // result reached the model context
    expect(modelBodies()[1]).toContain('[UNTRUSTED_EXTERNAL_CONTENT'); // D6: social read results are wrapped as untrusted
    for (const secret of [ACCESS, REFRESH]) {
      expect(raw).not.toContain(secret);
      for (const b of modelBodies()) expect(b).not.toContain(secret);
      expect(logged.join('\n')).not.toContain(secret);
    }
  });

  it('a gateway error on a social tool: the SSE stream and model context still carry no token', async () => {
    callOpenClawTool.mockRejectedValue(new Error('upstream exploded'));
    fetchMock
      .mockResolvedValueOnce(toolCalls(['t1', 'openclaw__x__read_dms', {}]))
      .mockResolvedValueOnce(stop('The read failed.'));
    const { raw } = await post('read my dms');
    expect(callOpenClawTool).toHaveBeenCalled();
    for (const secret of [ACCESS, REFRESH]) {
      expect(raw).not.toContain(secret);
      for (const b of modelBodies()) expect(b).not.toContain(secret);
      expect(logged.join('\n')).not.toContain(secret);
      expect(JSON.stringify(recordAction.mock.calls) + JSON.stringify(recordActionSafe.mock.calls)).not.toContain(secret);
    }
  });
});

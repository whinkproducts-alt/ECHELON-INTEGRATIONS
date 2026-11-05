/** C03: saved order reaches dispatch, and a side effect is never replayed on the next model. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DispatchBlockedError } from '@/lib/model-router/admission';
import { __resetModelHealth, planRoute, skipReasonFor, type RouteContext } from '@/lib/model-router/priority';
import { fallbackMayContinue, orderedFromPlan } from '@/lib/model-router/ordered-dispatch';
import { localDefaultModel, modelRegistry, purposeModel } from '@/lib/model-router/registry';
import type { ToolDefinition } from '../tool-loop';

const ENV = { ANTHROPIC_API_KEY: 'present', NVIDIA_API_KEY: 'present', DEFAULT_MODEL: 'wink-qwen3.5-9b-8k' };
const ctx = (over: Partial<RouteContext> = {}): RouteContext => ({
  lockedDown: false, localOnly: false, dataClass: 'private', needsTools: true, needsStream: false,
  paidAdmitted: () => true, env: ENV, ...over,
});

describe('ordered plan', () => {
  it('stops at a manual handoff and does not include anything after it', () => {
    const plan = planRoute(['anthropic-sonnet', 'deepseek-browser', 'local-default'], ctx({ dataClass: 'internal', needsTools: false }));
    const ordered = orderedFromPlan(plan);
    expect(ordered.candidates.map((c) => c.id)).toEqual(['anthropic-sonnet']);
    expect(ordered.handoff?.id).toBe('deepseek-browser');
  });

  it('skips an API entry that cannot stream when the caller needs a stream, and never admits NVIDIA trial', () => {
    const local = modelRegistry(ENV).find((e) => e.id === 'local-default')!;
    expect(skipReasonFor({ ...local, capabilities: { ...local.capabilities, stream: false } }, ctx({ needsStream: true }), ENV)).toBe('stream_unsupported');
    const nvidia = modelRegistry(ENV).find((e) => e.id === 'nvidia-nemotron-3-ultra')!;
    expect(nvidia.admitted).toBe(false);
    expect(nvidia.capabilities.stream).toBe(false);
    const planned = planRoute(['nvidia-nemotron-3-ultra', 'local-default'], ctx({ needsStream: true, needsTools: false, dataClass: 'synthetic' }));
    expect(planned.skipped).toEqual([{ id: 'nvidia-nemotron-3-ultra', reason: 'trial_evaluation_only' }]);
    expect(planned.steps.map((s) => s.entry.id)).toEqual(['local-default']);
  });

  it('an account-wide block does not continue; a model-specific failure does, until a byte or a tool', () => {
    expect(fallbackMayContinue(new DispatchBlockedError('TOKEN_HARD_LIMIT'))).toBe(false);
    expect(fallbackMayContinue(new DispatchBlockedError('MISSING_ACCOUNT'))).toBe(false);
    expect(fallbackMayContinue(new DispatchBlockedError('PAID_NOT_ADMITTED'))).toBe(true);
    expect(fallbackMayContinue(new Error('endpoint error 429'))).toBe(true);
    expect(fallbackMayContinue(new Error('endpoint error 401'))).toBe(true);
    expect(fallbackMayContinue(Object.assign(new Error('stopped'), { name: 'AbortError' }))).toBe(false);
    expect(fallbackMayContinue(new Error('cancel'))).toBe(false);
    expect(fallbackMayContinue(new Error('endpoint error 429'), true, false)).toBe(false);
    expect(fallbackMayContinue(new Error('endpoint error 429'), false, true)).toBe(false);
  });

  it('unset defaults are one name; a purpose env overrides it and does not invent another', () => {
    expect(localDefaultModel({})).toBe(localDefaultModel({ DEFAULT_MODEL: undefined }));
    expect(localDefaultModel({})).toBe('wink-qwen3.5-9b-8k');
    expect(purposeModel({ EXTRACTION_MODEL: 'gemma3:4b' }, 'EXTRACTION_MODEL')).toBe('gemma3:4b');
    expect(purposeModel({ WHINK_LOCAL_MODEL: 'gemma3:4b' }, 'EXTRACTION_MODEL')).toBe('gemma3:4b');
    expect(purposeModel({}, 'SWARM_MODEL')).toBe('wink-qwen3.5-9b-8k');
  });
});

describe('tool loop uses the saved order only before a side effect', () => {
  const chatWithTools = vi.fn();
  const executeTool = vi.fn();
  const TOOLS: ToolDefinition[] = [
    { name: 'memory_read', description: 'Read', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  ];

  beforeEach(() => {
    vi.resetModules();
    __resetModelHealth();
    chatWithTools.mockReset();
    executeTool.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  async function load() {
    vi.doMock('@/lib/model-router-tools', () => ({
      chatWithTools,
      ToolsUnsupportedError: class ToolsUnsupportedError extends Error { constructor(m: string) { super(m); this.name = 'ToolsUnsupportedError'; } },
      redactForLog: (s: string) => s,
      providerFor: () => 'openai-compatible',
    }));
    vi.doMock('@/lib/model-router/dispatch', () => ({
      admittedCall: async (_scope: unknown, run: () => Promise<unknown>) => run(),
    }));
    vi.doMock('@/lib/tool-registry', () => ({ executeTool }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe: vi.fn().mockResolvedValue({ id: 'a' }) }));
    vi.doMock('@/lib/offline', () => ({
      applyOfflineFallback: async (input: { model: string; apiKey?: string }) => ({ model: input.model, apiKey: input.apiKey, fellBack: false, reason: null }),
    }));
    return import('../tool-loop');
  }

  async function drain(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let raw = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += dec.decode(value, { stream: true });
    }
    return raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
  }

  const order = [
    { id: 'anthropic-sonnet', model: 'claude-sonnet-5-5', apiKey: 'user-key' },
    { id: 'anthropic-haiku', model: 'claude-haiku-5-5', apiKey: 'user-key' },
    { id: 'local-default', model: 'wink-qwen3.5-9b-8k' },
  ];

  it('401 on the first choice uses the second and does not call the third', async () => {
    chatWithTools
      .mockRejectedValueOnce(new Error('OpenAI-compatible endpoint error 401: no'))
      .mockResolvedValueOnce({ text: 'from-second', toolCalls: [], stopReason: 'end_turn' });
    const { runToolLoop } = await load();
    const { healthOf: health } = await import('@/lib/model-router/priority');
    const events = await drain(await runToolLoop({
      messages: [{ role: 'user', content: 'hi' }], tools: TOOLS, userId: 'u1', model: order[0].model, modelOrder: order,
    }));
    expect(chatWithTools.mock.calls.map((c) => c[0].model)).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5']);
    expect(events.find((e) => e.type === 'text')?.content).toBe('from-second');
    expect(health('anthropic-sonnet')).toBe('credential_rejected');
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('after a tool has run, a later failure does not call the next saved model', async () => {
    chatWithTools
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'c1', name: 'memory_read', input: { query: 'x' } }],
        stopReason: 'tool_use',
      })
      .mockRejectedValueOnce(new Error('endpoint error 429: slow down'));
    executeTool.mockResolvedValue({ success: true, data: { hits: 1 }, timestamp: 't', toolVersion: '1' });
    const { runToolLoop } = await load();
    const events = await drain(await runToolLoop({
      messages: [{ role: 'user', content: 'hi' }], tools: TOOLS, userId: 'u1', model: order[0].model, modelOrder: order,
    }));
    expect(executeTool).toHaveBeenCalledOnce();
    expect(chatWithTools.mock.calls.map((c) => c[0].model)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5-5']);
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(events.some((e) => e.code === 'MODEL_ROUTE_HANDOFF')).toBe(false);
  });

  it('a token hard limit does not fall through to the next model', async () => {
    chatWithTools.mockRejectedValueOnce(new DispatchBlockedError('TOKEN_HARD_LIMIT'));
    const { runToolLoop } = await load();
    const events = await drain(await runToolLoop({
      messages: [{ role: 'user', content: 'hi' }], tools: TOOLS, userId: 'u1', model: order[0].model, modelOrder: order,
    }));
    expect(chatWithTools).toHaveBeenCalledOnce();
    expect(events.find((e) => e.type === 'error')?.code).toBe('TOKEN_HARD_LIMIT');
  });

  it('exhausting automatic choices pauses at the manual handoff and does not call past it', async () => {
    chatWithTools.mockRejectedValue(new Error('endpoint error 402'));
    const { runToolLoop } = await load();
    const events = await drain(await runToolLoop({
      messages: [{ role: 'user', content: 'hi' }], tools: TOOLS, userId: 'u1', model: order[0].model,
      modelOrder: order.slice(0, 1),
      handoffAfter: { id: 'deepseek-browser', label: 'DeepSeek chat in the browser (manual handoff)', url: 'https://chat.deepseek.com/' },
    }));
    expect(chatWithTools).toHaveBeenCalledOnce();
    expect(events.find((e) => e.type === 'error')).toMatchObject({ code: 'MODEL_ROUTE_HANDOFF', handoffUrl: 'https://chat.deepseek.com/' });
  });
});

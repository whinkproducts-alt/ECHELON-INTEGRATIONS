import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isOmniRouteModel, resolveOmniRoute, omniRouteBaseUrl, omniRouteConfigured } from '@/lib/model-router/omniroute';
import { classifyCost, decideAdmission } from '@/lib/model-router/admission';
import { localOnlyViolation } from '@/lib/local-only';
import { isModelAllowed } from '@/lib/model-policy';
import { isCloudModel, isNativeOllamaModel, chatOnce } from '@/lib/model-router';
import { chatWithTools } from '@/lib/model-router-tools';

const KEY = { OMNIROUTE_API_KEY: 'sk-omni-test' };

describe('OmniRoute model ids', () => {
  it('recognises omniroute/ models only', () => {
    expect(isOmniRouteModel('omniroute/some-model')).toBe(true);
    expect(isOmniRouteModel('omniroute/')).toBe(false);
    expect(isOmniRouteModel('gpt-4o')).toBe(false);
    expect(isOmniRouteModel(undefined)).toBe(false);
  });

  it('resolves to the gateway URL, key and the bare model id; other models resolve to null', () => {
    expect(resolveOmniRoute('omniroute/a/b:c', KEY)).toEqual({ baseUrl: 'http://localhost:20128/v1', apiKey: 'sk-omni-test', model: 'a/b:c' });
    expect(resolveOmniRoute('wink-qwen3.5-9b-8k', KEY)).toBeNull();
    expect(omniRouteBaseUrl({ OMNIROUTE_BASE_URL: 'http://127.0.0.1:9000/v1/' })).toBe('http://127.0.0.1:9000/v1');
  });

  it('refuses to resolve without a key instead of sending an unauthenticated request', () => {
    expect(() => resolveOmniRoute('omniroute/x', {})).toThrow(/OMNIROUTE_API_KEY/);
    expect(omniRouteConfigured({})).toBe(false);
    expect(omniRouteConfigured({ OMNIROUTE_API_KEY: '  ' })).toBe(false);
  });
});

describe('OmniRoute is never treated as local', () => {
  it('cost is unknown, and so refused, until the operator says free', () => {
    expect(classifyCost({ model: 'omniroute/x', env: {} as NodeJS.ProcessEnv })).toBe('unknown');
    expect(classifyCost({ model: 'omniroute/x', env: { WHINK_OMNIROUTE_COST: 'metered' } as unknown as NodeJS.ProcessEnv })).toBe('unknown');
    expect(classifyCost({ model: 'omniroute/x', env: { WHINK_OMNIROUTE_COST: 'free' } as unknown as NodeJS.ProcessEnv })).toBe('free');
  });

  it('free is admitted normally but still refused in lockdown and Local-Only', () => {
    const base = { userId: 'u', costClass: 'free' as const, priceKnown: true, paidAdmitted: false, spendCapMicros: null, reservedTokens: 1000, reservedMicros: 0, tokenUsed: 0, tokenReserved: 0, tokenLimit: null, tokenHardPct: 100, spendUsedMicros: 0, spendReservedMicros: 0, lockedDown: false, localOnly: false };
    expect(decideAdmission(base)).toEqual({ ok: true });
    expect(decideAdmission({ ...base, lockedDown: true })).toEqual({ ok: false, code: 'LOCKDOWN' });
    expect(decideAdmission({ ...base, localOnly: true })).toEqual({ ok: false, code: 'LOCAL_ONLY' });
    expect(decideAdmission({ ...base, costClass: 'unknown' })).toEqual({ ok: false, code: 'UNKNOWN_COST' });
  });

  it('Local-Only mode refuses it and it counts as a cloud model', () => {
    expect(localOnlyViolation('omniroute/x', {}, { WHINK_LOCAL_ONLY: 'true' } as unknown as NodeJS.ProcessEnv)).toMatch(/OmniRoute/);
    expect(isCloudModel('omniroute/x')).toBe(true);
    expect(isNativeOllamaModel('omniroute/gemma-3')).toBe(false);
  });

  it('is allowed in the picker only when configured', () => {
    expect(isModelAllowed('omniroute/x', { hasOwnKey: false, env: KEY })).toBe(true);
    expect(isModelAllowed('omniroute/x', { hasOwnKey: false, env: {} })).toBe(false);
    expect(isModelAllowed('omniroute/x', { hasOwnKey: true, env: {} })).toBe(false);
  });
});

describe('request to the gateway', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OMNIROUTE_API_KEY', 'sk-omni-test');
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }), { status: 200 }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('goes to the OmniRoute URL with its key and the prefix removed, and sends no Ollama-only options', async () => {
    const text = await chatOnce({ model: 'omniroute/provider/model-x', messages: [{ role: 'user', content: 'hi' }] });
    expect(text).toBe('hello');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:20128/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-omni-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('provider/model-x');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('think');
  });

  it('fails clearly, with no network call, when no key is set', async () => {
    vi.stubEnv('OMNIROUTE_API_KEY', '');
    await expect(chatOnce({ model: 'omniroute/x', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/OMNIROUTE_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('other models still use the configured OpenAI-compatible endpoint, not OmniRoute', async () => {
    await chatOnce({ model: 'wink-qwen3.5-9b-8k', messages: [{ role: 'user', content: 'hi' }] });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('the tool-calling path (what chat uses) sends tools to OmniRoute with its key, the bare model id and a baseUrl override ignored', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok', tool_calls: [{ id: 'c1', function: { name: 'calendar_list', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }), { status: 200 }));
    const out = await chatWithTools({ model: 'omniroute/provider/model-x', baseUrl: 'http://localhost:11434/v1', messages: [{ role: 'user', content: 'what is on my calendar' }], tools: [{ name: 'calendar_list', description: 'List events', inputSchema: { type: 'object', properties: {} } }] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:20128/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-omni-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('provider/model-x');
    expect(body.tools).toHaveLength(1);
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(out.toolCalls[0]).toMatchObject({ name: 'calendar_list' });
  });
});

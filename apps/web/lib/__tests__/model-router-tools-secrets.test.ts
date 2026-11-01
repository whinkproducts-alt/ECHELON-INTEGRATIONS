import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const KEY = 'sk-SECRET-KEY-12345';
const base = { messages: [{ role: 'user' as const, content: 'hi' }], tools: [] };

describe('model-router-tools secret handling', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.doMock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Gemini key goes in a header, never in the URL', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }));
    const { chatWithTools } = await import('../model-router-tools');
    await chatWithTools({ ...base, model: 'gemini-2.0-flash', apiKey: KEY });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain(KEY);
    expect(String(url)).not.toMatch(/[?&]key=/);
    expect(init.headers['x-goog-api-key']).toBe(KEY);
    expect(init.body).not.toContain(KEY);
  });

  it('Gemini error does not leak the key', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 500 }));
    const { chatWithTools } = await import('../model-router-tools');
    const err = await chatWithTools({ ...base, model: 'gemini-2.0-flash', apiKey: KEY }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).not.toContain(KEY);
  });

  it('OpenAI-compatible errors do not include the API key', async () => {
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'http://example.test/v1');
    for (const status of [401, 500, 400]) {
      fetchMock.mockResolvedValue(new Response('upstream failure', { status }));
      const { chatWithTools } = await import('../model-router-tools');
      const err = await chatWithTools({ ...base, model: 'llama3.1:8b', apiKey: KEY }).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(String(err.message)).not.toContain(KEY);
    }
    vi.unstubAllEnvs();
  });

  it('OpenAI-compatible sends the key only as an Authorization header', async () => {
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'http://example.test/v1');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }), { status: 200 }));
    const { chatWithTools } = await import('../model-router-tools');
    await chatWithTools({ ...base, model: 'llama3.1:8b', apiKey: KEY });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain(KEY);
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).not.toContain(KEY);
    vi.unstubAllEnvs();
  });

  it('upstream body that echoes the key never reaches the thrown message', async () => {
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'http://example.test/v1');
    const errorLog = vi.fn();
    vi.doMock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: errorLog, info: vi.fn() } }));
    fetchMock.mockResolvedValue(new Response(`invalid api key ${KEY} Authorization: Bearer ${KEY}`, { status: 401 }));
    const { chatWithTools } = await import('../model-router-tools');
    const err = await chatWithTools({ ...base, model: 'llama3.1:8b', apiKey: KEY }).catch((e) => e);
    expect(err.message).toBe('OpenAI-compatible endpoint error 401');
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(KEY);
    expect(JSON.stringify(errorLog.mock.calls)).toContain('401');
    vi.unstubAllEnvs();
  });

  it('tools-unsupported detection still works without leaking the body', async () => {
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'http://example.test/v1');
    fetchMock.mockResolvedValue(new Response(`model does not support tools ${KEY}`, { status: 400 }));
    const { chatWithTools, ToolsUnsupportedError } = await import('../model-router-tools');
    const err = await chatWithTools({ ...base, model: 'llama3.1:8b', apiKey: KEY }).catch((e) => e);
    expect(err).toBeInstanceOf(ToolsUnsupportedError);
    expect(err.message).not.toContain(KEY);
    vi.unstubAllEnvs();
  });

  it('SSE error event from the tool loop never carries the upstream body or key', async () => {
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'http://example.test/v1');
    vi.doMock('@/lib/tool-registry', () => ({ executeTool: vi.fn() }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe: vi.fn() }));
    fetchMock.mockResolvedValue(new Response(`echo ${KEY}`, { status: 502 }));
    const { runToolLoop } = await import('../tool-loop');
    const stream = await runToolLoop({ messages: [{ role: 'user', content: 'hi' }], tools: [], userId: 'u1', model: 'llama3.1:8b', apiKey: KEY });
    const reader = stream.getReader();
    let raw = '';
    const dec = new TextDecoder();
    while (true) { const { done, value } = await reader.read(); if (done) break; raw += dec.decode(value); }
    expect(raw).not.toContain(KEY);
    expect(raw).toContain('Model provider error');
    vi.unstubAllEnvs();
  });
});

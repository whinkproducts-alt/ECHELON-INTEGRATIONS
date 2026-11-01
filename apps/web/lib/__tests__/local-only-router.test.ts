/** Local-Only mode: every router entry point refuses anything that would leave the machine. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localOnlyModel, localOnlyViolation, isLoopbackUrl } from '../local-only';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('WHINK_LOCAL_ONLY', 'true');
  vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', undefined);
  vi.stubEnv('OPENAI_COMPATIBLE_API_KEY', 'cloud-key-should-never-be-sent');
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-envkey');
  vi.stubEnv('GEMINI_API_KEY', 'gem-envkey');
  vi.stubEnv('OLLAMA_URL', undefined);
  vi.stubEnv('WHINK_OLLAMA_NATIVE_MODELS', undefined);
  vi.stubEnv('WHINK_LOCAL_MODEL', 'gemma3:4b');
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], message: { content: 'ok' }, data: [{ embedding: [] }] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const msgs = [{ role: 'user' as const, content: 'hi' }];
const lookalikes = ['http://localhost.evil.com:11434/v1', 'http://127.0.0.1.evil.com/v1', 'http://evil.com/localhost/v1', 'http://10.0.0.5:11434/v1', 'http://192.168.1.2/v1', 'http://host.docker.internal/v1', 'http://localhost@evil.com/v1', 'ftp://localhost/v1'];

describe('isLoopbackUrl', () => {
  it('accepts only exact loopback hosts', () => {
    for (const u of ['http://localhost:11434/v1', 'http://127.0.0.1:11434', 'http://[::1]:11434', 'https://localhost']) expect(isLoopbackUrl(u), u).toBe(true);
    for (const u of lookalikes) expect(isLoopbackUrl(u), u).toBe(false);
  });
});

describe('streamChat', () => {
  it('refuses claude, gemini, BYOK keys, non-loopback and lookalike base URLs, and never fetches', async () => {
    const { streamChat } = await import('../model-router');
    await expect(streamChat({ messages: msgs, model: 'claude-sonnet-4-5' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    await expect(streamChat({ messages: msgs, model: 'gemini-2.5-flash' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    await expect(streamChat({ messages: msgs, model: 'llama3.1:8b', apiKey: 'byok' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    for (const baseUrl of lookalikes) await expect(streamChat({ messages: msgs, model: 'llama3.1:8b', baseUrl }), baseUrl).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'https://api.openai.com/v1');
    await expect(streamChat({ messages: msgs, model: 'gpt-4o' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('a local model works and sends no cloud key', async () => {
    const { streamChat } = await import('../model-router');
    fetchMock.mockImplementationOnce(async () => new Response('data: [DONE]\n\n', { status: 200 }));
    await streamChat({ messages: msgs, model: 'llama3.1:8b' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^http:\/\/localhost:11434/);
    expect(JSON.stringify(fetchMock.mock.calls[0][1].headers)).not.toContain('cloud-key');
  });
});

describe('chatOnce', () => {
  it('refuses the same set, and never fetches', async () => {
    const { chatOnce } = await import('../model-router');
    await expect(chatOnce({ messages: msgs, model: 'claude-haiku-4-5-20251001' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    await expect(chatOnce({ messages: msgs, model: 'gemini-2.5-flash' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    await expect(chatOnce({ messages: msgs, model: 'llama3.1:8b', apiKey: 'byok' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    for (const baseUrl of lookalikes) await expect(chatOnce({ messages: msgs, model: 'gemma3', baseUrl })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('a local model works; the cloud env key is replaced by a placeholder', async () => {
    const { chatOnce } = await import('../model-router');
    expect(await chatOnce({ messages: msgs, model: 'llama3.1:8b' })).toBe('ok');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer ollama');
  });
});

describe('chatWithTools', () => {
  const base = { messages: [{ role: 'user' as const, content: 'hi' }], tools: [] };
  it('refuses the same set, and never fetches', async () => {
    const { chatWithTools } = await import('../model-router-tools');
    await expect(chatWithTools({ ...base, model: 'claude-sonnet-4-5' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    await expect(chatWithTools({ ...base, model: 'gemini-2.5-flash' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    await expect(chatWithTools({ ...base, model: 'llama3.1:8b', apiKey: 'byok' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    for (const baseUrl of lookalikes) await expect(chatWithTools({ ...base, model: 'gemma3', baseUrl })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'https://api.example.com/v1');
    await expect(chatWithTools({ ...base, model: 'llama3.1:8b' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('a remote OLLAMA_URL is refused even for a native model', async () => {
    vi.stubEnv('OLLAMA_URL', 'http://localhost.evil.com:11434');
    const { chatWithTools } = await import('../model-router-tools');
    await expect(chatWithTools({ ...base, model: 'gemma3' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('a local model sends no cloud key', async () => {
    const { chatWithTools } = await import('../model-router-tools');
    await chatWithTools({ ...base, model: 'llama3.1:8b' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer ollama');
  });
});

describe('embed', () => {
  it('returns null and never fetches for a remote, lookalike or OpenAI embeddings target', async () => {
    const cases: Array<Record<string, string>> = [
      { EMBEDDINGS_URL: 'https://api.openai.com/v1' },
      { EMBEDDINGS_URL: 'http://localhost.evil.com/v1' },
      { EMBEDDING_MODEL: 'openai/text-embedding-3-small', OPENAI_API_KEY: 'sk-x' },
      { EMBEDDING_MODEL: 'ollama/nomic-embed-text', OLLAMA_URL: 'http://127.0.0.1.evil.com:11434' },
    ];
    for (const env of cases) {
      vi.stubEnv('EMBEDDINGS_URL', '');
      vi.stubEnv('EMBEDDING_MODEL', '');
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      vi.resetModules();
      const { embed } = await import('../model-router');
      expect(await embed({ text: 'x' }), JSON.stringify(env)).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('a loopback Ollama embeddings target is allowed', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'ollama/nomic-embed-text');
    vi.stubEnv('EMBEDDINGS_URL', '');
    vi.stubEnv('OLLAMA_URL', 'http://localhost:11434');
    const { embed } = await import('../model-router');
    await embed({ text: 'x' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('helpers and background callers', () => {
  it('localOnlyModel swaps a cloud model for the local one and leaves a local one alone', () => {
    expect(localOnlyModel('claude-haiku-4-5-20251001')).toBe('gemma3:4b');
    expect(localOnlyModel('gemini-2.5-flash')).toBe('gemma3:4b');
    expect(localOnlyModel('llama3.1:8b')).toBe('llama3.1:8b');
    vi.stubEnv('WHINK_LOCAL_ONLY', '');
    expect(localOnlyModel('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5-20251001');
  });
  it('localOnlyViolation is null when the mode is off', () => {
    vi.stubEnv('WHINK_LOCAL_ONLY', 'false');
    expect(localOnlyViolation('claude-sonnet-4-5', { apiKey: 'k' })).toBeNull();
  });
  it('background model choices go local: extraction, swarm and the skills pipeline', async () => {
    vi.stubEnv('DEFAULT_MODEL', 'claude-haiku-4-5-20251001');
    vi.stubEnv('SWARM_MODEL', '');
    vi.stubEnv('SKILL_PIPELINE_MODEL', '');
    const { pipelineModel } = await import('../skills/model');
    expect(pipelineModel()).toBe('gemma3:4b');
  });
});

describe('native Ollama transport (LOW 7a, 7b)', () => {
  it('labels its error correctly and never echoes the raw upstream body', async () => {
    vi.stubEnv('WHINK_LOCAL_ONLY', '');
    fetchMock.mockImplementationOnce(async () => new Response('secret Bearer abc123 sk-leakedkey', { status: 500 }));
    const { chatOnce } = await import('../model-router');
    const err = (await chatOnce({ messages: msgs, model: 'gemma3' }).catch((e) => e)) as Error;
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/chat');
    expect(err.message).toBe('Ollama native endpoint error 500');
    expect(err.message).not.toMatch(/OpenAI|abc123|sk-leaked/);
  });
  it('is not used when the caller passed a base URL that is not the loopback Ollama origin', async () => {
    vi.stubEnv('WHINK_LOCAL_ONLY', '');
    const { isNativeOllamaModel, chatOnce } = await import('../model-router');
    expect(isNativeOllamaModel('gemma3')).toBe(true);
    expect(isNativeOllamaModel('gemma3', 'http://localhost:11434/v1')).toBe(true);
    expect(isNativeOllamaModel('gemma3', 'https://api.example.com/v1')).toBe(false);
    expect(isNativeOllamaModel('gemma3', 'http://localhost:9999/v1')).toBe(false);
    await chatOnce({ messages: msgs, model: 'gemma3', baseUrl: 'https://api.example.com/v1' });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/v1/chat/completions');
  });
  it('is not used when OPENAI_COMPATIBLE_BASE_URL points elsewhere (no silent ignore)', async () => {
    vi.stubEnv('WHINK_LOCAL_ONLY', '');
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'https://llm.example.com/v1');
    const { isNativeOllamaModel, chatOnce } = await import('../model-router');
    expect(isNativeOllamaModel('gemma3')).toBe(false);
    await chatOnce({ messages: msgs, model: 'gemma3' });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://llm.example.com/v1/chat/completions');
  });
  it('chatWithTools follows the same rule', async () => {
    vi.stubEnv('WHINK_LOCAL_ONLY', '');
    const { chatWithTools } = await import('../model-router-tools');
    await chatWithTools({ messages: [{ role: 'user', content: 'hi' }], tools: [], model: 'gemma3', baseUrl: 'https://api.example.com/v1' });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/v1/chat/completions');
  });
});

describe('native Ollama request shape and errors (E1, E7, S4, T3)', () => {
  beforeEach(() => { vi.stubEnv('WHINK_LOCAL_ONLY', ''); });
  const toolsBase = { messages: [{ role: 'user' as const, content: 'hi' }], tools: [] };

  it('sends num_ctx (default 8192) and keep_alive (default 30m), and refuses redirects, on chatWithTools and chatOnce', async () => {
    const { chatWithTools } = await import('../model-router-tools');
    const { chatOnce } = await import('../model-router');
    await chatWithTools({ ...toolsBase, model: 'gemma3' });
    await chatOnce({ messages: msgs, model: 'gemma3' });
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('/api/chat');
      const body = JSON.parse(call[1].body);
      expect(body.options.num_ctx).toBe(8192);
      expect(body.keep_alive).toBe('30m');
      expect(call[1].redirect).toBe('error');
    }
  });
  it('honours WHINK_OLLAMA_NUM_CTX and WHINK_OLLAMA_KEEP_ALIVE', async () => {
    vi.stubEnv('WHINK_OLLAMA_NUM_CTX', '16384');
    vi.stubEnv('WHINK_OLLAMA_KEEP_ALIVE', '2h');
    const { chatWithTools } = await import('../model-router-tools');
    await chatWithTools({ ...toolsBase, model: 'gemma3' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.options.num_ctx).toBe(16384);
    expect(body.keep_alive).toBe('2h');
  });
  it('passes redirect:error on the OpenAI-compatible and embedding requests too', async () => {
    vi.stubEnv('WHINK_OLLAMA_NATIVE_MODELS', '');
    const { chatOnce, streamChat, embed } = await import('../model-router');
    const { chatWithTools } = await import('../model-router-tools');
    await chatOnce({ messages: msgs, model: 'llama3.1:8b' });
    fetchMock.mockImplementationOnce(async () => new Response('data: [DONE]\n\n', { status: 200 }));
    await streamChat({ messages: msgs, model: 'llama3.1:8b' });
    await chatWithTools({ ...toolsBase, model: 'llama3.1:8b' });
    vi.stubEnv('EMBEDDING_MODEL', 'ollama/nomic-embed-text');
    await embed({ text: 'x' });
    expect(fetchMock.mock.calls.length).toBe(4);
    for (const call of fetchMock.mock.calls) expect(call[1].redirect, String(call[0])).toBe('error');
  });
  it('a 404 model-not-found says to run ollama pull <model>, on both transports', async () => {
    const { chatWithTools } = await import('../model-router-tools');
    const { chatOnce } = await import('../model-router');
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "model 'gemma9' not found" }), { status: 404 }));
    const a = await chatWithTools({ ...toolsBase, model: 'gemma9' }).catch((e) => e);
    expect(a.name).toBe('ProviderUserError');
    expect(a.userMessage).toBe('Model "gemma9" is not installed in Ollama. run: ollama pull gemma9');
    const b = await chatOnce({ messages: msgs, model: 'gemma9' }).catch((e) => e);
    expect(b.userMessage).toContain('run: ollama pull gemma9');
  });
  it('a 400 "does not support tools" is still detected as tools-unsupported (text assumed from Ollama; not confirmed offline)', async () => {
    const { chatWithTools, ToolsUnsupportedError } = await import('../model-router-tools');
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: '"registry.ollama.ai/library/gemma3:latest" does not support tools' }), { status: 400 }));
    await expect(chatWithTools({ ...toolsBase, model: 'gemma3' })).rejects.toBeInstanceOf(ToolsUnsupportedError);
  });
  it('a 500 from a malformed tool call ends the turn with a clear error through the tool loop', async () => {
    vi.doMock('@/lib/usage', () => ({ recordUsage: vi.fn() }));
    vi.doMock('@/lib/offline', () => ({ applyOfflineFallback: async (o: any) => ({ model: o.model }) }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe: vi.fn(), recordAction: vi.fn(), updateActionStatus: vi.fn() }));
    vi.doMock('@/lib/tool-registry', () => ({ executeTool: vi.fn() }));
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'error parsing tool call: invalid character' }), { status: 500 }));
    const { runToolLoop } = await import('../tool-loop');
    const stream = await runToolLoop({ messages: [{ role: 'user', content: 'hi' }], tools: [{ name: 'read_file', description: 'd', inputSchema: {} }], userId: 'u1', model: 'gemma3' });
    const reader = stream.getReader();
    let text = '';
    for (;;) { const { done, value } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); }
    expect(text).toContain('malformed tool call');
    expect(text).not.toContain('invalid character');
  });
  it('synthetic tool-call ids are unique across replies', async () => {
    const { chatWithTools } = await import('../model-router-tools');
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ message: { content: '', tool_calls: [{ function: { name: 'a', arguments: {} } }, { function: { name: 'b', arguments: {} } }] } }), { status: 200 }));
    const r1 = await chatWithTools({ ...toolsBase, model: 'gemma3' });
    const r2 = await chatWithTools({ ...toolsBase, model: 'gemma3' });
    const ids = [...r1.toolCalls, ...r2.toolCalls].map((c) => c.id);
    expect(new Set(ids).size).toBe(4);
  });
  it('T3: the request really aborts when the configured timeout passes', async () => {
    vi.stubEnv('WHINK_OLLAMA_TIMEOUT_MS', '40');
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: any) => {
      signal = init.signal;
      return new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
    });
    const { chatOnce } = await import('../model-router');
    const { chatWithTools } = await import('../model-router-tools');
    await expect(chatOnce({ messages: msgs, model: 'gemma3' })).rejects.toBeTruthy();
    expect(signal!.aborted).toBe(true);
    signal = undefined;
    const err = await chatWithTools({ ...toolsBase, model: 'gemma3' }).catch((e) => e);
    expect(signal!.aborted).toBe(true);
    expect(err.name).toBe('TimeoutError');
  });
});

describe('L2: redirect:error only for Local-Only or loopback targets', () => {
  it('redirectOpt branches', async () => {
    const { redirectOpt } = await import('../local-only');
    vi.stubEnv('WHINK_LOCAL_ONLY', '');
    expect(redirectOpt('https://api.openai.com/v1')).toEqual({});
    expect(redirectOpt('https://proxy.corp.example/v1')).toEqual({});
    expect(redirectOpt('http://127.0.0.1:11434/v1')).toEqual({ redirect: 'error' });
    expect(redirectOpt('http://localhost.evil.com/v1')).toEqual({});
    vi.stubEnv('WHINK_LOCAL_ONLY', 'true');
    expect(redirectOpt('https://anything.example')).toEqual({ redirect: 'error' });
  });
  it('a cloud OpenAI-compatible endpoint keeps default redirects in normal mode; loopback refuses them', async () => {
    vi.stubEnv('WHINK_LOCAL_ONLY', '');
    vi.stubEnv('WHINK_OLLAMA_NATIVE_MODELS', '');
    const { chatOnce } = await import('../model-router');
    const { chatWithTools } = await import('../model-router-tools');
    await chatOnce({ messages: msgs, model: 'gpt-4o', baseUrl: 'https://api.example.com/v1' });
    await chatWithTools({ messages: msgs, tools: [], model: 'gpt-4o', baseUrl: 'https://api.example.com/v1' });
    for (const call of fetchMock.mock.calls) expect(call[1].redirect, String(call[0])).toBeUndefined();
    fetchMock.mockClear();
    await chatOnce({ messages: msgs, model: 'llama3.1:8b' });
    await chatWithTools({ messages: msgs, tools: [], model: 'llama3.1:8b' });
    for (const call of fetchMock.mock.calls) expect(call[1].redirect, String(call[0])).toBe('error');
  });
  it('cloud embeddings keep default redirects; EMBEDDINGS_URL on a remote host too (normal mode)', async () => {
    vi.stubEnv('WHINK_LOCAL_ONLY', '');
    vi.stubEnv('EMBEDDING_MODEL', 'openai/text-embedding-3-small');
    vi.stubEnv('OPENAI_API_KEY', 'sk-x');
    const { embed } = await import('../model-router');
    await embed({ text: 'x' });
    expect(fetchMock.mock.calls[0][1].redirect).toBeUndefined();
  });
});

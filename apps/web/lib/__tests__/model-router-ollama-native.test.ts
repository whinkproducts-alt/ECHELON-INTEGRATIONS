import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const tool = { name: 'calendar_list', description: 'List', inputSchema: { type: 'object', properties: {} } };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('native Ollama transport', () => {
  const fetchMock = vi.fn();
  const saved = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.doMock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
    delete process.env.OLLAMA_URL;
    delete process.env.WHINK_OLLAMA_NATIVE_MODELS;
    delete process.env.OPENAI_COMPATIBLE_BASE_URL;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...saved };
  });

  const tools = async () => (await import('../model-router-tools')).chatWithTools;

  it('sends the native request shape', async () => {
    fetchMock.mockResolvedValue(ok({ message: { content: 'hi' }, done: true }));
    await (await tools())({ messages: [{ role: 'user', content: 'x' }], model: 'Gemma3:4b', tools: [tool], maxTokens: 99, apiKey: 'sk-cloud' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'Gemma3:4b', stream: false, think: false, options: { num_predict: 99 } });
    expect(body.tools[0]).toEqual({ type: 'function', function: { name: 'calendar_list', description: 'List', parameters: tool.inputSchema } });
    expect(JSON.stringify(init.headers).toLowerCase()).not.toContain('authorization');
    expect(init.body).not.toContain('sk-cloud');
    expect(init.signal).toBeDefined();
  });

  it('omits tools when none and maps the tool round trip', async () => {
    fetchMock.mockResolvedValue(ok({ message: { content: 'done' }, done: true }));
    await (await tools())({
      model: 'gemma3',
      tools: [],
      messages: [
        { role: 'user', content: 'cal?' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'call_0', name: 'calendar_list', input: { days: 7 } }] },
        { role: 'tool', toolCallId: 'call_0', name: 'ignored', content: 'result' },
      ],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.messages[1]).toEqual({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'calendar_list', arguments: { days: 7 } } }] });
    expect(body.messages[2]).toEqual({ role: 'tool', content: 'result', tool_name: 'calendar_list' });
  });

  it('maps responses: object args, string args, usage, tool_use', async () => {
    fetchMock.mockResolvedValue(ok({
      message: { content: '', tool_calls: [{ function: { name: 'a', arguments: { x: 1 } } }, { function: { name: 'b', arguments: '{"y":2}' } }] },
      done: true, done_reason: 'stop', prompt_eval_count: 11, eval_count: 5,
    }));
    const r = await (await tools())({ messages: [{ role: 'user', content: 'x' }], model: 'gemma3', tools: [tool] });
    expect(r.toolCalls).toEqual([{ id: 'call_0', name: 'a', input: { x: 1 } }, { id: 'call_1', name: 'b', input: { y: 2 } }]);
    expect(r.stopReason).toBe('tool_use');
    expect(r.usage).toEqual({ tokensIn: 11, tokensOut: 5 });
  });

  it('maps missing tool_calls, length and missing usage', async () => {
    fetchMock.mockResolvedValue(ok({ message: { content: 'cut' }, done: true, done_reason: 'length' }));
    const r = await (await tools())({ messages: [{ role: 'user', content: 'x' }], model: 'gemma3', tools: [] });
    expect(r).toEqual({ text: 'cut', toolCalls: [], stopReason: 'max_tokens', usage: { tokensIn: 0, tokensOut: 0 } });
    fetchMock.mockResolvedValue(ok({ message: { content: 'fine' }, done: true, done_reason: 'stop' }));
    expect((await (await tools())({ messages: [{ role: 'user', content: 'x' }], model: 'gemma3', tools: [] })).stopReason).toBe('end');
  });

  it('falls through to /v1 for non-gemma, claude/gemini, and cloud models', async () => {
    fetchMock.mockImplementation(async () => ok({ choices: [{ message: { content: 'ok' } }] }));
    const chat = await tools();
    await chat({ messages: [{ role: 'user', content: 'x' }], model: 'qwen3:8b', tools: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
    fetchMock.mockImplementation(async () => ok({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }));
    await chat({ messages: [{ role: 'user', content: 'x' }], model: 'gemini-2.0-flash', tools: [], apiKey: 'k' });
    expect(String(fetchMock.mock.calls[1][0])).toContain('generativelanguage.googleapis.com');
    process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://api.openai.com/v1';
    fetchMock.mockImplementation(async () => ok({ choices: [{ message: { content: 'ok' } }] }));
    await chat({ messages: [{ role: 'user', content: 'x' }], model: 'gpt-4o', tools: [] });
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('gemma with non-loopback or lookalike OLLAMA_URL keeps /v1', async () => {
    const { isNativeOllamaModel, isLoopbackHost } = await import('../model-router');
    for (const u of ['http://192.168.1.5:11434', 'http://127.0.0.1.evil.com:11434', 'http://localhost.evil.com:11434', 'http://evil.com/127.0.0.1', 'garbage']) {
      process.env.OLLAMA_URL = u;
      expect(isNativeOllamaModel('gemma3')).toBe(false);
    }
    for (const u of ['http://127.0.0.1:11434', 'http://[::1]:11434', 'http://LOCALHOST:11434/']) {
      process.env.OLLAMA_URL = u;
      expect(isNativeOllamaModel('gemma3')).toBe(true);
    }
    expect(isLoopbackHost('127.0.0.1.evil.com')).toBe(false);
    process.env.OLLAMA_URL = 'http://192.168.1.5:11434';
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: 'ok' } }] }));
    await (await tools())({ messages: [{ role: 'user', content: 'x' }], model: 'gemma3', tools: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('WHINK_OLLAMA_NATIVE_MODELS overrides and empty disables', async () => {
    const { isNativeOllamaModel } = await import('../model-router');
    process.env.WHINK_OLLAMA_NATIVE_MODELS = 'llama, Phi';
    expect(isNativeOllamaModel('llama3.1:8b')).toBe(true);
    expect(isNativeOllamaModel('phi4')).toBe(true);
    expect(isNativeOllamaModel('gemma3')).toBe(false);
    process.env.WHINK_OLLAMA_NATIVE_MODELS = '';
    expect(isNativeOllamaModel('gemma3')).toBe(false);
  });

  it('HTTP errors keep the same error types', async () => {
    const chat = await tools();
    const { ToolsUnsupportedError } = await import('../model-router-tools');
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const e = await chat({ messages: [{ role: 'user', content: 'x' }], model: 'gemma3', tools: [] }).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(ToolsUnsupportedError);
    fetchMock.mockResolvedValue(new Response('registry.ollama.ai/gemma does not support tools function', { status: 400 }));
    const e2 = await chat({ messages: [{ role: 'user', content: 'x' }], model: 'gemma3', tools: [tool] }).catch((x) => x);
    expect(e2).toBeInstanceOf(ToolsUnsupportedError);
  });

  it('timeout abort propagates', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const e = await (await tools())({ messages: [{ role: 'user', content: 'x' }], model: 'gemma3', tools: [] }).catch((x) => x);
    expect(e.name).toBe('TimeoutError');
  });

  it('chatOnce uses native for gemma and /v1 otherwise', async () => {
    const { chatOnce } = await import('../model-router');
    fetchMock.mockResolvedValue(ok({ message: { content: 'hello' }, done: true }));
    expect(await chatOnce({ model: 'gemma3', messages: [{ role: 'user', content: 'x' }], maxTokens: 50, temperature: 0.2 })).toBe('hello');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(init.body)).toMatchObject({ stream: false, think: false, options: { num_predict: 50, temperature: 0.2 } });
    expect(JSON.stringify(init.headers).toLowerCase()).not.toContain('authorization');
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: 'v1' } }] }));
    expect(await chatOnce({ model: 'qwen3:8b', messages: [{ role: 'user', content: 'x' }] })).toBe('v1');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it.each(['gemma3', 'local-analysis-model'])('chatOnce propagates cancellation to the %s transport', async (model) => {
    const { chatOnce } = await import('../model-router');
    const ac = new AbortController();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    }));
    const pending = chatOnce({ model, messages: [{ role: 'user', content: 'internal draft' }], signal: ac.signal });
    ac.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('background admission requires local Ollama weights and refuses remote or unknown metadata', async () => {
    const { verifyLocalAnalysisModel } = await import('../model-router');
    expect(await verifyLocalAnalysisModel('local', 'https://remote.example/v1')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(ok({ model_info: { 'general.parameter_count': 1000 }, tensors: [{ name: 'weights' }] }));
    expect(await verifyLocalAnalysisModel('local', 'http://localhost:11434/v1')).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/show');
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error');
    fetchMock.mockResolvedValue(ok({ remote_host: 'cloud.example', model_info: { 'general.parameter_count': 1000 }, tensors: [] }));
    expect(await verifyLocalAnalysisModel('local', 'http://localhost:11434/v1')).toBe(false);
    fetchMock.mockResolvedValue(ok({}));
    expect(await verifyLocalAnalysisModel('local', 'http://localhost:11434/v1')).toBe(false);
  });
});

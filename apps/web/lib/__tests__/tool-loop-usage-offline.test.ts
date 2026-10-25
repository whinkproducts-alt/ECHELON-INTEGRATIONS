import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function drain(stream: ReadableStream<Uint8Array>) {
  const r = stream.getReader(); const d = new TextDecoder(); let raw = '';
  for (;;) { const { done, value } = await r.read(); if (done) break; raw += d.decode(value, { stream: true }); }
  return raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
}
const jsonRes = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as any;
const ENV = { ...process.env };

describe('tool loop: usage recording and offline fallback wiring', () => {
  beforeEach(() => { vi.resetModules(); vi.doMock('@/lib/tool-registry', () => ({ executeTool: vi.fn() })); });
  afterEach(() => { vi.restoreAllMocks(); process.env = { ...ENV }; });

  it('records provider-reported usage for the calling user, fire-and-forget', async () => {
    const recordUsage = vi.fn();
    vi.doMock('@/lib/usage', () => ({ recordUsage }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonRes({
      choices: [{ finish_reason: 'stop', message: { content: 'hi' } }], usage: { prompt_tokens: 12, completion_tokens: 3 },
    }));
    const { runToolLoop } = await import('../tool-loop');
    await drain(await runToolLoop({ messages: [{ role: 'user', content: 'x' }], tools: [], userId: 'u1', persona: 'WHINK', model: 'llama3.1:8b' }));
    expect(recordUsage).toHaveBeenCalledWith({ userId: 'u1', provider: 'openai-compatible', model: 'llama3.1:8b', tokensIn: 12, tokensOut: 3, kind: 'tool_loop' });
  });

  it('with the flag off the configured cloud model is used untouched', async () => {
    delete process.env.WHINK_OFFLINE_FALLBACK;
    vi.doMock('@/lib/usage', () => ({ recordUsage: vi.fn() }));
    process.env.OPENAI_COMPATIBLE_BASE_URL = 'http://llm.test/v1';
    const applyOfflineFallback = vi.fn(async (i: any) => ({ model: i.model, apiKey: i.apiKey, fellBack: false, reason: null }));
    vi.doMock('@/lib/offline', () => ({ applyOfflineFallback }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }));
    const { runToolLoop } = await import('../tool-loop');
    await drain(await runToolLoop({ messages: [{ role: 'user', content: 'x' }], tools: [], userId: 'u1', persona: 'WHINK', model: 'some-model' }));
    expect(applyOfflineFallback).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', model: 'some-model' }));
  });

  it('when the fallback picks the local model the router call uses it and the cloud key is not sent', async () => {
    vi.doMock('@/lib/usage', () => ({ recordUsage: vi.fn() }));
    vi.doMock('@/lib/offline', () => ({ applyOfflineFallback: async () => ({ model: 'qwen2.5:7b', apiKey: undefined, fellBack: true, reason: 'offline' }) }));
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'stop', message: { content: 'local' } }] }));
    const { runToolLoop } = await import('../tool-loop');
    const events = await drain(await runToolLoop({ messages: [{ role: 'user', content: 'x' }], tools: [], userId: 'u1', persona: 'WHINK', model: 'claude-sonnet-5-5', apiKey: 'sk-byok-secret' }));
    expect(JSON.parse(f.mock.calls[0][1]!.body as string).model).toBe('qwen2.5:7b');
    expect(JSON.stringify(f.mock.calls[0][1]!.headers)).not.toContain('sk-byok-secret');
    expect(events.some((e) => e.type === 'text' && e.content === 'local')).toBe(true);
  });
});

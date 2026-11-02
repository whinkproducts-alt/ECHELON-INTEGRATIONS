/**
 * Tests for lib/model-router.ts
 * Uses Vitest with module mocking — no real API calls for unit tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Drain a ReadableStream<Uint8Array> to a string */
async function drainStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

/** Parse SSE lines from a drained stream string */
function parseSSELines(raw: string): Array<{ type: string; content?: string; error?: string }> {
  return raw
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)));
}

// ── 1. Provider routing ───────────────────────────────────────────────────────

describe('provider routing', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEFAULT_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes claude-* to Anthropic SDK', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    vi.doMock('@anthropic-ai/sdk', () => {
      const mockStream = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } };
      })();
      const streamFn = vi.fn().mockResolvedValue(mockStream);
      // Constructor must be a regular function so `new` works
      function MockAnthropic(this: any) {
        this.messages = { stream: streamFn };
      }
      return { default: MockAnthropic };
    });

    const { streamChat } = await import('../model-router');
    const stream = await streamChat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'claude-sonnet-4-6',
    });

    const raw = await drainStream(stream);
    const lines = parseSSELines(raw);
    expect(lines.find((l) => l.type === 'done')).toBeDefined();
  });

  it('routes gemini-* to Google Generative AI SDK', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    vi.doMock('@google/generative-ai', () => {
      const mockStream = (async function* () {
        yield { text: () => 'hello' };
      })();
      const sendMessageStream = vi.fn().mockResolvedValue({ stream: mockStream });
      const startChat = vi.fn().mockReturnValue({ sendMessageStream });
      const getGenerativeModel = vi.fn().mockReturnValue({ startChat });
      function MockGoogleGenerativeAI(this: any) {
        this.getGenerativeModel = getGenerativeModel;
      }
      return { GoogleGenerativeAI: MockGoogleGenerativeAI };
    });

    const { streamChat } = await import('../model-router');
    const stream = await streamChat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gemini-2.0-flash',
    });

    const raw = await drainStream(stream);
    const lines = parseSSELines(raw);
    expect(lines.find((l) => l.type === 'done')).toBeDefined();
  });

  it('routes llama3.1:8b to OpenAI-compatible endpoint via fetch', async () => {
    const sseBody = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';
    const encoder = new TextEncoder();
    const mockResponse = {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseBody));
          controller.close();
        },
      }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    const { streamChat } = await import('../model-router');
    const stream = await streamChat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'llama3.1:8b',
    });

    const raw = await drainStream(stream);
    const lines = parseSSELines(raw);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
    expect(url).toContain('/chat/completions');
    const request = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(request.reasoning_effort).toBe('none');
    expect(request.think).toBe(false);
    expect(lines.find((l) => l.type === 'done')).toBeDefined();
  });

  it('does not send the local reasoning option to a remote OpenAI-compatible endpoint', async () => {
    const encoder = new TextEncoder();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close(); } }),
    } as any);
    process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://api.example.test/v1';
    const { streamChat } = await import('../model-router');
    await streamChat({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' });
    const request = JSON.parse((vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(request.reasoning_effort).toBeUndefined();
    delete process.env.OPENAI_COMPATIBLE_BASE_URL;
  });
});

// ── 2. Missing key errors ─────────────────────────────────────────────────────

describe('missing API key errors', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('throws containing "ANTHROPIC_API_KEY" when key is absent for claude-* model', async () => {
    const { streamChat } = await import('../model-router');
    await expect(
      streamChat({ messages: [{ role: 'user', content: 'hi' }], model: 'claude-sonnet-4-6' }),
    ).rejects.toThrow('ANTHROPIC_API_KEY');
  });

  it('throws containing "GEMINI_API_KEY" when key is absent for gemini-* model', async () => {
    const { streamChat } = await import('../model-router');
    await expect(
      streamChat({ messages: [{ role: 'user', content: 'hi' }], model: 'gemini-2.0-flash' }),
    ).rejects.toThrow('GEMINI_API_KEY');
  });
});

// ── 3. SSE output format ──────────────────────────────────────────────────────

describe('SSE output format', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('emits data: <json> lines with type+content, ending with type:done', async () => {
    vi.doMock('@anthropic-ai/sdk', () => {
      const mockStream = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'foo' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'bar' } };
      })();
      const streamFn = vi.fn().mockResolvedValue(mockStream);
      function MockAnthropic(this: any) {
        this.messages = { stream: streamFn };
      }
      return { default: MockAnthropic };
    });

    const { streamChat } = await import('../model-router');
    const stream = await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'claude-sonnet-4-6',
    });

    const raw = await drainStream(stream);

    // Every non-empty line must start with "data: "
    const nonEmpty = raw.split('\n').filter((l) => l.trim() !== '');
    for (const line of nonEmpty) {
      expect(line).toMatch(/^data: /);
    }

    const lines = parseSSELines(raw);

    // All text chunks have both type and content
    const textLines = lines.filter((l) => l.type === 'text');
    expect(textLines.length).toBeGreaterThanOrEqual(1);
    for (const tl of textLines) {
      expect(tl).toHaveProperty('content');
      expect(typeof tl.content).toBe('string');
    }

    // Last item is the done sentinel
    const lastLine = lines[lines.length - 1];
    expect(lastLine.type).toBe('done');

    // Full text correct
    const fullText = textLines.map((l) => l.content).join('');
    expect(fullText).toBe('foobar');
  });

  it('emits type:error inside stream when Anthropic SDK throws mid-stream', async () => {
    vi.doMock('@anthropic-ai/sdk', () => {
      const mockStream = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } };
        throw new Error('network blip');
      })();
      const streamFn = vi.fn().mockResolvedValue(mockStream);
      function MockAnthropic(this: any) {
        this.messages = { stream: streamFn };
      }
      return { default: MockAnthropic };
    });

    const { streamChat } = await import('../model-router');
    const stream = await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'claude-sonnet-4-6',
    });

    const raw = await drainStream(stream);
    const lines = parseSSELines(raw);

    const errorLine = lines.find((l) => l.type === 'error');
    expect(errorLine).toBeDefined();
    expect(errorLine!.error).toContain('network blip');
  });
});

// ── 4. BYOK — user-supplied apiKey overrides server env key ──────────────────

describe('BYOK apiKey override', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streamChat uses user-supplied apiKey for Anthropic when env key is absent', async () => {
    let capturedKey: string | undefined;

    vi.doMock('@anthropic-ai/sdk', () => {
      const mockStream = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } };
      })();
      const streamFn = vi.fn().mockResolvedValue(mockStream);
      function MockAnthropic(this: any, opts: any) {
        capturedKey = opts?.apiKey;
        this.messages = { stream: streamFn };
      }
      return { default: MockAnthropic };
    });

    const { streamChat } = await import('../model-router');
    const stream = await streamChat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'claude-sonnet-4-5',
      apiKey: 'sk-ant-user-supplied-key',
    });
    await drainStream(stream);
    expect(capturedKey).toBe('sk-ant-user-supplied-key');
  });

  it('streamChat user apiKey takes precedence over server ANTHROPIC_API_KEY', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-server-key';
    let capturedKey: string | undefined;

    vi.doMock('@anthropic-ai/sdk', () => {
      const mockStream = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } };
      })();
      const streamFn = vi.fn().mockResolvedValue(mockStream);
      function MockAnthropic(this: any, opts: any) {
        capturedKey = opts?.apiKey;
        this.messages = { stream: streamFn };
      }
      return { default: MockAnthropic };
    });

    const { streamChat } = await import('../model-router');
    await streamChat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'claude-haiku-4-5-20251001',
      apiKey: 'sk-ant-user-key-wins',
    });
    expect(capturedKey).toBe('sk-ant-user-key-wins');
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('streamChat still throws when no key available at all for Anthropic', async () => {
    const { streamChat } = await import('../model-router');
    await expect(
      streamChat({ messages: [{ role: 'user', content: 'hi' }], model: 'claude-sonnet-4-5' }),
    ).rejects.toThrow('ANTHROPIC_API_KEY');
  });

  it('streamChat passes user apiKey as Authorization header for OpenAI-compatible endpoint', async () => {
    let capturedHeaders: Record<string, string> | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: new ReadableStream({
          start(ctrl) {
            ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));
            ctrl.close();
          },
        }),
      } as any;
    });

    const { streamChat } = await import('../model-router');
    await streamChat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-4o',
      apiKey: 'sk-user-openai-key',
    });

    expect(capturedHeaders?.Authorization).toBe('Bearer sk-user-openai-key');
    vi.restoreAllMocks();
  });
});

describe.skipIf(!process.env.OLLAMA_INTEGRATION_MODEL)('Ollama round-trip (integration)', () => {
  it(
    'streams a response from the explicitly configured installed local model',
    async () => {
      vi.resetModules();
      const baseUrl = (process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
      const url = new URL(baseUrl);
      expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
      const res = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(5000) });
      expect(res.ok).toBe(true);
      const { streamChat } = await import('../model-router');
      const model = process.env.OLLAMA_INTEGRATION_MODEL!;
      const stream = await streamChat({
        messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
        model,
        maxTokens: 64,
      });

      const raw = await drainStream(stream);
      const lines = parseSSELines(raw);

      const textLines = lines.filter((l) => l.type === 'text');
      expect(textLines.length).toBeGreaterThan(0);

      const fullText = textLines.map((l) => l.content).join('').trim();
      expect(fullText.length).toBeGreaterThan(0);

      expect(lines[lines.length - 1].type).toBe('done');
    },
    90_000, // Explicit hardware integration may include a cold local-model load.
  );
});

// ── selectModel unit tests ────────────────────────────────────────────────────

describe('selectModel', () => {
  beforeEach(() => vi.resetModules());

  it('returns haiku for a short simple question', async () => {
    const { selectModel } = await import('../model-router');
    const model = selectModel([{ role: 'user', content: 'What is the capital of Canada?' }]);
    expect(model).toBe('claude-haiku-5-5');
  });

  it('returns opus for MAMBA persona regardless of content', async () => {
    const { selectModel } = await import('../model-router');
    const model = selectModel(
      [{ role: 'user', content: 'What is 2+2?' }],
      { persona: 'MAMBA' },
    );
    expect(model).toBe('claude-opus-5-5');
  });

  it('returns opus for forceTier opus', async () => {
    const { selectModel } = await import('../model-router');
    const model = selectModel([{ role: 'user', content: 'hi' }], { forceTier: 'opus' });
    expect(model).toBe('claude-opus-5-5');
  });

  it('returns haiku for forceTier haiku', async () => {
    const { selectModel } = await import('../model-router');
    const model = selectModel([{ role: 'user', content: 'Complex architecture review needed' }], { forceTier: 'haiku' });
    expect(model).toBe('claude-haiku-5-5');
  });

  it('returns sonnet for forceTier sonnet', async () => {
    const { selectModel } = await import('../model-router');
    const model = selectModel([{ role: 'user', content: 'hi' }], { forceTier: 'sonnet' });
    expect(model).toBe('claude-sonnet-5-5');
  });

  it('returns opus for high complexityScore', async () => {
    const { selectModel } = await import('../model-router');
    const model = selectModel([{ role: 'user', content: 'anything' }], { complexityScore: 8 });
    expect(model).toBe('claude-opus-5-5');
  });

  it('returns haiku for low complexityScore', async () => {
    const { selectModel } = await import('../model-router');
    const model = selectModel([{ role: 'user', content: 'anything' }], { complexityScore: 2 });
    expect(model).toBe('claude-haiku-5-5');
  });

  it('returns sonnet for mid complexityScore', async () => {
    const { selectModel } = await import('../model-router');
    const model = selectModel([{ role: 'user', content: 'anything' }], { complexityScore: 5 });
    expect(model).toBe('claude-sonnet-5-5');
  });

  it('bumps to opus when estimatedOutputTokens > 2000 on a borderline score', async () => {
    const { selectModel } = await import('../model-router');
    // complexityScore 5 = Sonnet, but +2 from large output → 7 = Opus
    const model = selectModel(
      [{ role: 'user', content: 'anything' }],
      { complexityScore: 5, estimatedOutputTokens: 3000 },
    );
    expect(model).toBe('claude-opus-5-5');
  });

  it('auto-selects sonnet for a code-heavy message', async () => {
    const { selectModel } = await import('../model-router');
    const model = selectModel([
      { role: 'user', content: 'Can you refactor this function?\n```typescript\nasync function foo() {}\n```' },
    ]);
    expect(model).toBe('claude-sonnet-5-5');
  });

  it('auto-selects opus for architecture/security keywords', async () => {
    const { selectModel } = await import('../model-router');
    const model = selectModel([
      { role: 'user', content: 'Do a full security threat model and architect a migration strategy for the auth system.' },
    ]);
    expect(model).toBe('claude-opus-5-5');
  });

  it('streamChat uses hints when model is omitted', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.doMock('@anthropic-ai/sdk', () => {
      const mockStream = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } };
      })();
      const streamFn = vi.fn().mockResolvedValue(mockStream);
      function MockAnthropic(this: any) { this.messages = { stream: streamFn }; }
      return { default: MockAnthropic };
    });
    const { streamChat } = await import('../model-router');
    const stream = await streamChat({
      messages: [{ role: 'user', content: 'What is 1+1?' }],
      hints: { forceTier: 'haiku' },
    });
    await drainStream(stream);
    // No assertion on model string here — just verifies it routes to Anthropic without throwing
  });
});

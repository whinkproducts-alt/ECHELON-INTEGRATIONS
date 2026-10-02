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
    expect(lines.find((l) => l.type === 'done')).toBeDefined();
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

// ── 4. Ollama round-trip (conditional integration) ────────────────────────────

describe('Ollama round-trip (integration)', () => {
  it(
    'skips gracefully when Ollama is not reachable',
    async () => {
      vi.resetModules();
      const baseUrl = (
        process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://localhost:11434/v1'
      ).replace(/\/$/, '');

      let ollamaUp = false;
      try {
        const res = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(500) });
        ollamaUp = res.ok;
      } catch {
        ollamaUp = false;
      }

      if (!ollamaUp) {
        console.log('Ollama not reachable — skipping integration test');
        return;
      }

      const { streamChat } = await import('../model-router');
      const model = process.env.DEFAULT_MODEL ?? 'llama3.1:8b';
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
    5_000, // 5 s timeout for the integration test
  );
});

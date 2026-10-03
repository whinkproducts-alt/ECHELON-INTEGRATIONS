import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ToolDefinition } from '../tool-loop';

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

function parseSSE(raw: string) {
  return raw
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)));
}

const TEST_TOOLS: ToolDefinition[] = [
  {
    name: 'memory_read',
    description: 'Read memory',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
];

describe('runToolLoop — non-Anthropic fallback', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('falls back to streamChat for non-claude models', async () => {
    const sseBody = 'data: {"choices":[{"delta":{"content":"pong"}}]}\n\ndata: [DONE]\n\n';
    const encoder = new TextEncoder();
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) { c.enqueue(encoder.encode(sseBody)); c.close(); },
      }),
    } as any);

    const { runToolLoop } = await import('../tool-loop');
    const stream = await runToolLoop({
      messages: [{ role: 'user', content: 'ping' }],
      tools: TEST_TOOLS,
      userId: 'u1',
      model: 'llama3.1:8b',
    });

    const raw = await drainStream(stream);
    const lines = parseSSE(raw);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(lines.find((l) => l.type === 'done')).toBeDefined();
  });
});

describe('runToolLoop — Anthropic single-turn (no tool call)', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('streams text and done when model returns no tool_use', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    vi.doMock('@anthropic-ai/sdk', () => {
      const create = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'hello from WHINK' }],
        stop_reason: 'end_turn',
      });
      function MockAnthropic(this: any) { this.messages = { create }; }
      return { default: MockAnthropic };
    });

    vi.doMock('@/lib/tool-registry', () => ({ executeTool: vi.fn() }));

    const { runToolLoop } = await import('../tool-loop');
    const stream = await runToolLoop({
      messages: [{ role: 'user', content: 'hi' }],
      tools: TEST_TOOLS,
      userId: 'u1',
      model: 'claude-sonnet-4-6',
    });

    const raw = await drainStream(stream);
    const lines = parseSSE(raw);

    const text = lines.filter((l) => l.type === 'text').map((l) => l.content).join('');
    expect(text).toBe('hello from WHINK');
    expect(lines.find((l) => l.type === 'done')).toBeDefined();
  });
});

describe('runToolLoop — Anthropic tool call round-trip', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('executes a tool and feeds result back, then streams final text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const create = vi.fn()
      // First call: model wants to use memory_read
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'memory_read', input: { query: 'Victor' } },
        ],
        stop_reason: 'tool_use',
      })
      // Second call: model responds with text after seeing tool result
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Found the memory.' }],
        stop_reason: 'end_turn',
      });

    vi.doMock('@anthropic-ai/sdk', () => {
      function MockAnthropic(this: any) { this.messages = { create }; }
      return { default: MockAnthropic };
    });

    vi.doMock('@/lib/tool-registry', () => ({
      executeTool: vi.fn().mockResolvedValue({
        success: true,
        data: { semantics: [{ statement: 'Victor is CEO' }] },
        timestamp: new Date().toISOString(),
        toolVersion: '1.0.0',
      }),
    }));

    const { runToolLoop } = await import('../tool-loop');
    const stream = await runToolLoop({
      messages: [{ role: 'user', content: 'What do you know about Victor?' }],
      tools: TEST_TOOLS,
      userId: 'u1',
      model: 'claude-sonnet-4-6',
    });

    const raw = await drainStream(stream);
    const lines = parseSSE(raw);

    // Should have emitted a tool_call event
    const toolCall = lines.find((l) => l.type === 'tool_call');
    expect(toolCall?.tool).toBe('memory_read');

    // Should have emitted a tool_result event
    const toolResult = lines.find((l) => l.type === 'tool_result');
    expect(toolResult?.success).toBe(true);

    // Final text from second model call
    const text = lines.filter((l) => l.type === 'text').map((l) => l.content).join('');
    expect(text).toBe('Found the memory.');

    expect(lines.find((l) => l.type === 'done')).toBeDefined();
    expect(create).toHaveBeenCalledTimes(2);
  });
});

// ── BYOK: apiKey threaded through to Anthropic client ────────────────────────

describe('runToolLoop — BYOK apiKey', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('passes user apiKey to Anthropic constructor when provided', async () => {
    let capturedKey: string | undefined;

    vi.doMock('@anthropic-ai/sdk', () => {
      const create = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'byok response' }],
        stop_reason: 'end_turn',
      });
      function MockAnthropic(this: any, opts: any) {
        capturedKey = opts?.apiKey;
        this.messages = { create };
      }
      return { default: MockAnthropic };
    });
    vi.doMock('@/lib/tool-registry', () => ({ executeTool: vi.fn() }));

    const { runToolLoop } = await import('../tool-loop');
    const stream = await runToolLoop({
      messages: [{ role: 'user', content: 'test' }],
      tools: TEST_TOOLS,
      userId: 'u1',
      model: 'claude-sonnet-4-5',
      apiKey: 'sk-ant-user-byok-key',
    });
    await drainStream(stream);

    expect(capturedKey).toBe('sk-ant-user-byok-key');
  });

  it('user apiKey takes precedence over ANTHROPIC_API_KEY env', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env-key';
    let capturedKey: string | undefined;

    vi.doMock('@anthropic-ai/sdk', () => {
      const create = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
      });
      function MockAnthropic(this: any, opts: any) {
        capturedKey = opts?.apiKey;
        this.messages = { create };
      }
      return { default: MockAnthropic };
    });
    vi.doMock('@/lib/tool-registry', () => ({ executeTool: vi.fn() }));

    const { runToolLoop } = await import('../tool-loop');
    await drainStream(await runToolLoop({
      messages: [{ role: 'user', content: 'test' }],
      tools: TEST_TOOLS,
      userId: 'u1',
      model: 'claude-haiku-4-5-20251001',
      apiKey: 'sk-ant-user-wins',
    }));

    expect(capturedKey).toBe('sk-ant-user-wins');
  });

  it('non-Anthropic model: passes apiKey as Authorization header via fetch', async () => {
    let capturedAuth: string | undefined;
    const encoder = new TextEncoder();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedAuth = (init?.headers as any)?.Authorization;
      return {
        ok: true,
        body: new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode('data: [DONE]\n\n'));
            c.close();
          },
        }),
      } as any;
    });

    const { runToolLoop } = await import('../tool-loop');
    await drainStream(await runToolLoop({
      messages: [{ role: 'user', content: 'test' }],
      tools: TEST_TOOLS,
      userId: 'u1',
      model: 'gpt-4o',
      apiKey: 'sk-user-openai-byok',
    }));

    expect(capturedAuth).toBe('Bearer sk-user-openai-byok');
  });
});

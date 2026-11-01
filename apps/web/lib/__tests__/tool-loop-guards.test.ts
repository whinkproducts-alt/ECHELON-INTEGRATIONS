import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ToolDefinition } from '../tool-loop';

async function drain(stream: ReadableStream<Uint8Array>): Promise<any[]> {
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

const TOOLS: ToolDefinition[] = [
  { name: 'memory_read', description: 'Read', inputSchema: { type: 'object', properties: {} } },
];
const jsonRes = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as any;
const call = (i: number, name: string) => ({ id: `c${i}`, type: 'function', function: { name, arguments: '{}' } });

describe('tool loop guards', () => {
  const executeTool = vi.fn();
  const recordActionSafe = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    executeTool.mockReset().mockResolvedValue({ success: true, data: { ok: 1 }, timestamp: 't', toolVersion: '1' });
    recordActionSafe.mockReset().mockResolvedValue({ id: 'r' });
    vi.doMock('@/lib/tool-registry', () => ({ executeTool }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('never executes a tool name that was not offered; records DENIED', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonRes({ choices: [{ message: { tool_calls: [call(1, 'openclaw__send_mail')] } }] }))
      .mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }));
    const { runToolLoop } = await import('../tool-loop');
    const events = await drain(await runToolLoop({ messages: [{ role: 'user', content: 'x' }], tools: TOOLS, userId: 'u1', model: 'llama3.1:8b' }));
    expect(executeTool).not.toHaveBeenCalled();
    const row = recordActionSafe.mock.calls[0][0];
    expect(row.status).toBe('DENIED');
    expect(row.outputSummary).toBe('tool not offered');
    expect(row.userId).toBe('u1');
    expect(events.find((e) => e.type === 'tool_result')?.success).toBe(false);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('caps tool calls per response at 8; extras are DENIED and error results', async () => {
    const calls = Array.from({ length: 11 }, (_, i) => call(i, 'memory_read'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonRes({ choices: [{ message: { tool_calls: calls } }] }))
      .mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }));
    const { runToolLoop, MAX_TOOL_CALLS_PER_TURN } = await import('../tool-loop');
    expect(MAX_TOOL_CALLS_PER_TURN).toBe(8);
    const events = await drain(await runToolLoop({ messages: [{ role: 'user', content: 'x' }], tools: TOOLS, userId: 'u1', model: 'llama3.1:8b' }));
    expect(executeTool).toHaveBeenCalledTimes(8);
    const denied = recordActionSafe.mock.calls.map((c) => c[0]).filter((r) => r.status === 'DENIED');
    expect(denied).toHaveLength(3);
    expect(denied.every((r) => r.outputSummary === 'per-turn tool call cap')).toBe(true);
    expect(events.filter((e) => e.type === 'tool_result' && !e.success)).toHaveLength(3);
    const second = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string);
    expect(second.messages.filter((m: any) => m.role === 'tool')).toHaveLength(11);
  });
});

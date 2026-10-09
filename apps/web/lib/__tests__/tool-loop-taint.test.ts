import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function drain(stream: ReadableStream<Uint8Array>): Promise<Array<Record<string, unknown>>> {
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

const TOOLS = [
  { name: 'openclaw__x__read_dms', description: 'r', inputSchema: { type: 'object', properties: {} } },
  { name: 'memory_write', description: 'w', inputSchema: { type: 'object', properties: {} } },
  { name: 'memory_read', description: 'q', inputSchema: { type: 'object', properties: {} } },
  { name: 'web_fetch', description: 'f', inputSchema: { type: 'object', properties: {} } },
];
const ok = (data: unknown) => ({ success: true, data, timestamp: 't', toolVersion: '1' });
const jsonRes = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const call = (id: string, name: string) => ({ id, type: 'function', function: { name, arguments: '{}' } });

describe('tool loop taint (M3)', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('passes tainted:false until an external read result enters the run, then tainted:true for the rest of it', async () => {
    const executeTool = vi.fn().mockResolvedValue(ok({ data: [] }));
    vi.doMock('@/lib/tool-registry', () => ({ executeTool }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe: vi.fn() }));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [call('1', 'memory_read'), call('2', 'openclaw__x__read_dms'), call('3', 'memory_write')] } }] }))
      .mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [call('4', 'web_fetch')] } }] }))
      .mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'stop', message: { content: 'done' } }] }));
    const { runToolLoop } = await import('../tool-loop');
    await drain(await runToolLoop({ messages: [{ role: 'user', content: 'hi' }], tools: TOOLS, userId: 'u1', model: 'llama3.1:8b', correlationId: 'c' }));
    const taintedByCall = executeTool.mock.calls.map((c) => [c[1], (c[6] as { tainted: boolean }).tainted]);
    expect(taintedByCall).toEqual([
      ['memory_read', false],
      ['openclaw__x__read_dms', false],
      ['memory_write', true],
      ['web_fetch', true],
    ]);
  });

  it('a run with no external tool never taints', async () => {
    const executeTool = vi.fn().mockResolvedValue(ok({ hits: 1 }));
    vi.doMock('@/lib/tool-registry', () => ({ executeTool }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe: vi.fn() }));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [call('1', 'memory_read'), call('2', 'memory_write')] } }] }))
      .mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'stop', message: { content: 'done' } }] }));
    const { runToolLoop } = await import('../tool-loop');
    await drain(await runToolLoop({ messages: [{ role: 'user', content: 'hi' }], tools: TOOLS, userId: 'u1', model: 'llama3.1:8b', correlationId: 'c' }));
    expect(executeTool.mock.calls.every((c) => (c[6] as { tainted: boolean }).tainted === false)).toBe(true);
  });
});

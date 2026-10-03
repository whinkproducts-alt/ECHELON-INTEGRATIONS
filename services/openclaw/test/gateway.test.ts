import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server as HttpServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Aggregator, capContent, MAX_RESPONSE_CHARS, MAX_DESCRIPTION_LEN, type UpstreamClient, type Connector } from '../src/aggregator.js';
import { createGateway, checkBearer } from '../src/server.js';
import type { ServerConfig } from '../src/config.js';

const cfg: ServerConfig[] = [{ platform: 'ref', transport: 'stdio', command: 'x', args: [], envNames: [] }];

function fakeClient(over: Partial<UpstreamClient> = {}): UpstreamClient {
  return {
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'echo',
          description: 'd'.repeat(2000),
          inputSchema: { type: 'object', properties: {} },
          annotations: { readOnlyHint: true },
          class: 'A',
        },
        { name: 'bad name', inputSchema: { type: 'object' } },
        { name: 'noschema' },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'hi' }] }),
    close: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

const servers: HttpServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
});

async function start(agg: Aggregator, token?: string): Promise<string> {
  const s = createGateway(agg, token);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

describe('Aggregator', () => {
  it('prefixes, caps descriptions, drops invalid tools, and strips annotations/class hints', async () => {
    const connector: Connector = async () => fakeClient();
    const agg = new Aggregator(cfg, connector, {});
    const tools = await agg.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('ref__echo');
    expect(tools[0].description.length).toBe(MAX_DESCRIPTION_LEN);
    expect(Object.keys(tools[0]).sort()).toEqual(['description', 'inputSchema', 'name']);
  });

  it('forwards calls to the right upstream with the original name', async () => {
    const client = fakeClient();
    const agg = new Aggregator(cfg, async () => client, {});
    await agg.listTools();
    const res = await agg.callTool('ref__echo', { message: 'x' });
    expect(client.callTool).toHaveBeenCalledWith({ name: 'echo', arguments: { message: 'x' } }, undefined, expect.any(Object));
    expect(res).toEqual({ content: [{ type: 'text', text: 'hi' }], isError: false });
  });

  it('returns an error result for unknown tools and failing upstreams', async () => {
    const client = fakeClient({ callTool: vi.fn().mockRejectedValue(new Error('boom secret-arg')) });
    const agg = new Aggregator(cfg, async () => client, {});
    await agg.listTools();
    expect((await agg.callTool('ref__nope', {})).isError).toBe(true);
    const r = await agg.callTool('ref__echo', {});
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r)).not.toContain('secret-arg');
  });

  it('skips an upstream that fails to connect and keeps the rest', async () => {
    const two: ServerConfig[] = [...cfg, { platform: 'dead', transport: 'stdio', command: 'y', args: [], envNames: [] }];
    const connector: Connector = async (c) => {
      if (c.platform === 'dead') throw new Error('nope');
      return fakeClient();
    };
    const tools = await new Aggregator(two, connector, {}).listTools();
    expect(tools.map((t) => t.name)).toEqual(['ref__echo']);
  });

  it('never logs call arguments or results', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const client = fakeClient({ callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'RESULT-TOKEN' }] }) });
    const agg = new Aggregator(cfg, async () => client, {});
    await agg.listTools();
    await agg.callTool('ref__echo', { token: 'ARG-TOKEN' });
    const logged = [...out.mock.calls, ...err.mock.calls].map((c) => String(c[0])).join('');
    out.mockRestore();
    err.mockRestore();
    expect(logged).not.toContain('ARG-TOKEN');
    expect(logged).not.toContain('RESULT-TOKEN');
  });
});

describe('capContent', () => {
  it('caps the response size and omits non-text parts', () => {
    const big = capContent([{ type: 'text', text: 'a'.repeat(MAX_RESPONSE_CHARS * 2) }]);
    expect(big.length).toBeLessThan(MAX_RESPONSE_CHARS + 20);
    expect(big.endsWith('[truncated]')).toBe(true);
    expect(capContent([{ type: 'image', data: 'AAAA' }])).toBe('[image content omitted]');
    expect(capContent('garbage')).toBe('');
  });
});

describe('HTTP gateway', () => {
  it('checkBearer compares tokens exactly', () => {
    expect(checkBearer('Bearer abc', 'abc')).toBe(true);
    expect(checkBearer('Bearer abd', 'abc')).toBe(false);
    expect(checkBearer('abc', 'abc')).toBe(false);
    expect(checkBearer(undefined, 'abc')).toBe(false);
  });

  it('healthz is open and carries no tool data', async () => {
    const base = await start(new Aggregator(cfg, async () => fakeClient(), {}), 'secret');
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('returns 401 without or with a wrong token when a token is set', async () => {
    const base = await start(new Aggregator(cfg, async () => fakeClient(), {}), 'secret');
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    expect((await fetch(`${base}/mcp`, { method: 'POST', headers, body })).status).toBe(401);
    expect((await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers, Authorization: 'Bearer wrong' }, body })).status).toBe(401);
  });

  it('serves tools/list and tools/call over streamable HTTP to an authenticated MCP client', async () => {
    const client = fakeClient();
    const base = await start(new Aggregator(cfg, async () => client, {}), 'secret');
    const mcp = new Client({ name: 't', version: '1' }, { capabilities: {} });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: 'Bearer secret' } } }));
    const list = await mcp.listTools();
    expect(list.tools.map((t) => t.name)).toEqual(['ref__echo']);
    const res = await mcp.callTool({ name: 'ref__echo', arguments: { a: 1 } });
    expect(res.content).toEqual([{ type: 'text', text: 'hi' }]);
    await mcp.close();
  });
});

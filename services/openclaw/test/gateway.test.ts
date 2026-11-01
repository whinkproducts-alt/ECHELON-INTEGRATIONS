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

async function start(agg: Aggregator, token = 'secret'): Promise<string> {
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

describe('tools allow-list, snapshots, timeouts', () => {
  const twoTools = () =>
    fakeClient({
      listTools: vi.fn().mockResolvedValue({
        tools: ['echo', 'get-sum', 'get-env'].map((name) => ({ name, inputSchema: { type: 'object' } })),
      }),
    });

  it('exposes only allow-listed tools', async () => {
    const c: ServerConfig[] = [{ ...(cfg[0] as ServerConfig), tools: ['echo', 'get-sum'] } as ServerConfig];
    const tools = await new Aggregator(c, async () => twoTools(), {}).listTools();
    expect(tools.map((t) => t.name)).toEqual(['ref__echo', 'ref__get_sum']);
  });

  it('serves the last good snapshot when an upstream later fails, and never logs the error message', async () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const client = twoTools();
    const agg = new Aggregator(cfg, async () => client, {});
    expect((await agg.listTools()).length).toBe(3);
    (client.listTools as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LEAKY-BODY-ghp_x'));
    await agg.refresh();
    const logged = err.mock.calls.map((c) => String(c[0])).join('');
    err.mockRestore();
    expect((await agg.listTools()).length).toBe(3);
    expect(logged).toContain('Error');
    expect(logged).not.toContain('LEAKY-BODY');
  });

  it('times out a hung listTools without blocking other upstreams', async () => {
    vi.useFakeTimers();
    try {
      const two: ServerConfig[] = [...cfg, { platform: 'slow', transport: 'stdio', command: 'y', args: [], envNames: [] }];
      const connector: Connector = async (c) =>
        c.platform === 'slow' ? fakeClient({ listTools: () => new Promise(() => undefined) }) : fakeClient();
      const agg = new Aggregator(two, connector, {});
      const p = agg.refresh();
      await vi.advanceTimersByTimeAsync(5_100);
      await p;
      expect((await agg.listTools()).map((t) => t.name)).toEqual(['ref__echo']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('L8 gateway request gating', () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer secret' };

  it('refuses to be created without a token', () => {
    expect(() => createGateway(new Aggregator(cfg, async () => fakeClient(), {}), '')).toThrow();
  });
  it('rejects any Origin header with 403, even with a valid token', async () => {
    const base = await start(new Aggregator(cfg, async () => fakeClient(), {}));
    const r = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers, Origin: 'http://evil.example' }, body });
    expect(r.status).toBe(403);
  });
  it('rejects unknown Host values (DNS rebinding) with 403', async () => {
    const base = await start(new Aggregator(cfg, async () => fakeClient(), {}));
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve, reject) => {
      const u = new URL(base);
      const rq = request({ host: u.hostname, port: u.port, path: '/mcp', method: 'POST', headers: { ...headers, Host: 'evil.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      rq.on('error', reject);
      rq.end(body);
    });
    expect(status).toBe(403);
  });
  it('still serves a valid request (token, allowed host, no origin)', async () => {
    const base = await start(new Aggregator(cfg, async () => fakeClient(), {}));
    expect((await fetch(`${base}/mcp`, { method: 'POST', headers, body })).status).toBe(200);
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

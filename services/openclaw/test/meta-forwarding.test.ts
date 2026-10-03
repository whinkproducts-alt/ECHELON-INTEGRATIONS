import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server as HttpServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Aggregator, forwardMeta, type Connector } from '../src/aggregator.js';
import { createGateway } from '../src/server.js';
import type { ServerConfig } from '../src/config.js';

const KEY = 'dev.whink/credential';
const CRED = JSON.stringify({ access_token: 'tok_TOPSECRET_999', platform_user_id: '1' });
const cfg: ServerConfig[] = [{ platform: 'x', transport: 'stdio', command: 'x', args: [], envNames: [] }];

/** A real SDK upstream over in-memory transport that records the _meta it receives. */
function stubConnector(seen: unknown[]): Connector {
  return async () => {
    const server = new Server({ name: 'stub', version: '0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'read_mentions', description: 'd', inputSchema: { type: 'object' } }] }));
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      seen.push(req.params._meta ?? null);
      return { content: [{ type: 'text', text: 'ok' }] };
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    const client = new Client({ name: 'gw', version: '0' }, { capabilities: {} });
    await client.connect(a);
    return client as never;
  };
}

const servers: HttpServer[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
});

async function gateway(agg: Aggregator) {
  const s = createGateway(agg, 'secret');
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const port = (s.address() as AddressInfo).port;
  const client = new Client({ name: 'web', version: '0' }, { capabilities: {} });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { Authorization: 'Bearer secret' } } }),
  );
  return client;
}

describe('forwardMeta', () => {
  it('keeps only the credential string and progressToken', () => {
    expect(forwardMeta({ [KEY]: CRED, progressToken: 5, other: 'x', 'io.modelcontextprotocol/related-task': { taskId: 't' } })).toEqual({ [KEY]: CRED, progressToken: 5 });
    expect(forwardMeta({ other: 1 })).toBeUndefined();
    expect(forwardMeta({ [KEY]: { not: 'string' } })).toBeUndefined();
    expect(forwardMeta({ [KEY]: 'x'.repeat(9000) })).toBeUndefined();
    expect(forwardMeta(undefined)).toBeUndefined();
  });
});

describe('gateway end to end', () => {
  it('forwards the credential to the upstream for that call only, stripping other keys', async () => {
    const seen: unknown[] = [];
    const client = await gateway(new Aggregator(cfg, stubConnector(seen), {}));
    await client.callTool({ name: 'x__read_mentions', arguments: {}, _meta: { [KEY]: CRED, evil: 'x', progressToken: 'p1' } });
    await client.callTool({ name: 'x__read_mentions', arguments: {} });
    await client.callTool({ name: 'x__read_mentions', arguments: {}, _meta: { other: 1 } });
    expect(seen[0]).toEqual({ [KEY]: CRED, progressToken: 'p1' });
    expect(seen[1]).toBeNull();
    expect(seen[2]).toBeNull();
  });

  it('never writes the credential to stdout or stderr', async () => {
    const out: string[] = [];
    const w1 = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { out.push(String(c)); return true; });
    const w2 = vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => { out.push(String(c)); return true; });
    const seen: unknown[] = [];
    const failing: Connector = async (c, e) => {
      const real = await stubConnector(seen)(c, e);
      real.callTool = async () => { throw new Error(`upstream blew up with ${CRED}`); };
      return real;
    };
    for (const connector of [stubConnector(seen), failing]) {
      const client = await gateway(new Aggregator(cfg, connector, {}));
      await client.callTool({ name: 'x__read_mentions', arguments: {}, _meta: { [KEY]: CRED } });
    }
    w1.mockRestore();
    w2.mockRestore();
    expect(out.join('')).not.toContain('TOPSECRET');
  });
});

describe('D9: no scraping or browser automation dependencies', () => {
  const banned = /(^|[/"])(puppeteer|puppeteer-core|playwright|playwright-core|selenium-webdriver|webdriverio|cheerio|nightmare|chromedriver|zombie|x-ray|crawlee|apify)(["/@]|$)/;
  const root = join(__dirname, '..');
  const locks = ['package-lock.json', 'package.json', 'upstreams/social/package-lock.json', 'upstreams/social/package.json', 'upstreams/ref/package.json'];
  it.each(locks)('%s', (f) => {
    const text = readFileSync(join(root, f), 'utf8');
    const hits = text.split('\n').filter((l) => banned.test(l) && /node_modules\/|"name"|^\s*"[^"]+":/.test(l));
    expect(hits).toEqual([]);
  });
  it('ref lockfile', () => {
    const p = join(root, 'upstreams/ref/package-lock.json');
    expect(statSync(p).isFile()).toBe(true);
    expect(readFileSync(p, 'utf8').split('\n').filter((l) => /node_modules\/(puppeteer|playwright|selenium-webdriver|cheerio)/.test(l))).toEqual([]);
  });
  it('social source imports no browser or scraping libs', () => {
    const dir = join(root, 'upstreams/social/src');
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/puppeteer|playwright|selenium|cheerio/);
  });
});

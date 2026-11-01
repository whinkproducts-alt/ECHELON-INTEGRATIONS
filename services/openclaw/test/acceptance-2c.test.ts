/** Phase 2c acceptance gaps: C3 boundary (63/64/65), C2 arbitrary new upstream, C1 shipped config. */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { exposeName, assignNames } from '../src/namespace.js';
import { Aggregator, type UpstreamClient } from '../src/aggregator.js';
import { parseConfig, type ServerConfig } from '../src/config.js';

const NAME_RE = /^[a-z0-9_]{1,64}$/;

describe('C3 full prefixed name boundary', () => {
  it.each([
    [48, 63, true],
    [49, 64, true],
    [50, 65, false],
  ])('body %i chars gives full length %i, accepted=%s', (n, total, ok) => {
    const r = exposeName('ref', 'a'.repeat(n));
    expect(r.ok).toBe(ok);
    if (r.ok) {
      const full = `openclaw__${r.name}`;
      expect(full.length).toBe(total);
      expect(full).toMatch(NAME_RE);
      expect(r.name).toBe(`ref__${'a'.repeat(n)}`); // untruncated
    }
  });

  it('a longer platform key shrinks the allowed body, still never truncating', () => {
    // openclaw__ (10) + 'longplatform__' (14) = 24, leaving 40
    expect(exposeName('longplatform', 'a'.repeat(40)).ok).toBe(true);
    expect(exposeName('longplatform', 'a'.repeat(41)).ok).toBe(false);
  });

  it('rejected tools are reported, not truncated, by assignNames', () => {
    const { accepted, rejected } = assignNames('ref', [{ name: 'a'.repeat(49) }, { name: 'a'.repeat(50) }]);
    expect(accepted.map((a) => a.exposed.length + 10)).toEqual([64]);
    expect(rejected.map((r) => r.tool.length)).toEqual([50]);
  });
});

describe('C2 a brand new platform needs only config', () => {
  it('parses a new platform from config and the aggregator exposes and forwards it', async () => {
    const parsed = parseConfig(JSON.stringify({ servers: [{ platform: 'zq9plat', transport: 'stdio', command: 'node', args: ['/app/upstreams/zq9/index.js'], env: [] }] }));
    const servers: ServerConfig[] = parsed;
    const client: UpstreamClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'do-thing', description: 'x', inputSchema: { type: 'object' } }] }),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const agg = new Aggregator(servers, async () => client, {});
    const tools = await agg.listTools();
    expect(tools.map((t) => t.name)).toEqual(['zq9plat__do_thing']);
    await agg.callTool('zq9plat__do_thing', { a: 1 });
    expect(client.callTool).toHaveBeenCalledWith({ name: 'do-thing', arguments: { a: 1 } }, undefined, expect.anything());
  });
});

describe('C1/C10 shipped config', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  it('config/servers.json parses under the real validator', () => {
    const raw = readFileSync(path.join(dir, '../config/servers.json'), 'utf8');
    expect(() => parseConfig(raw)).not.toThrow();
  });
  it('the gateway has exactly one runtime dependency, the MIT MCP SDK, pinned', () => {
    const pkg = JSON.parse(readFileSync(path.join(dir, '../package.json'), 'utf8'));
    expect(Object.keys(pkg.dependencies)).toEqual(['@modelcontextprotocol/sdk']);
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

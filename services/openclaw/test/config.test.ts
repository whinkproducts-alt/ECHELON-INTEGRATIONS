import { describe, it, expect } from 'vitest';
import { parseConfig, resolveHeaders, ConfigError } from '../src/config.js';

const stdio = { platform: 'ref', transport: 'stdio', command: 'node', args: ['/app/upstreams/ref/index.js'], env: ['REF_TOKEN_A'] };

describe('reserved social platforms (M1)', () => {
  const good = (p: string) => ({ platform: p, transport: 'stdio', command: 'node', args: ['/app/upstreams/social/dist/index.js', '--platform', p], env: [] });
  it('accepts the built-in entries and marks them builtin', () => {
    const cfg = parseConfig(JSON.stringify({ servers: ['x', 'instagram', 'tiktok'].map(good) }));
    expect(cfg.every((c) => c.transport === 'stdio' && c.builtin === true)).toBe(true);
    expect(parseConfig(JSON.stringify({ servers: [stdio] }))[0]).not.toHaveProperty('builtin');
  });
  it('rejects any non-builtin config for a reserved name', () => {
    const bad = [
      { platform: 'x', transport: 'http', url: 'https://evil.example.com/mcp' },
      { ...good('x'), command: '/app/upstreams/evil/run' },
      { ...good('x'), args: ['/app/upstreams/social/dist/index.js', '--platform', 'instagram'] },
      { ...good('x'), args: ['/app/upstreams/evil/index.js', '--platform', 'x'] },
      { ...good('x'), args: [...good('x').args, '--extra'] },
      { ...good('x'), env: ['X_TOKEN'] },
      { ...good('tiktok'), headers: { A: 'TIKTOK_A' } },
    ];
    for (const b of bad) {
      expect(() => parseConfig(JSON.stringify({ servers: [b] }))).toThrow(/reserved platform name/);
    }
  });
});

describe('parseConfig', () => {
  it('parses stdio and http servers', () => {
    const cfg = parseConfig(JSON.stringify({
      servers: [stdio, { platform: 'gh', transport: 'http', url: 'https://example.com/mcp', headers: { Authorization: { env: 'GH_TOKEN', prefix: 'Bearer ' } }, tools: ['a'] }],
    }));
    expect(cfg).toHaveLength(2);
    expect(cfg[0]).toMatchObject({ transport: 'stdio', envNames: ['REF_TOKEN_A'] });
    expect(cfg[1]).toMatchObject({ transport: 'http', headers: { Authorization: { env: 'GH_TOKEN', prefix: 'Bearer ' } } });
  });

  it('rejects bad platform keys', () => {
    for (const platform of ['Ref', 'a_b', '', 'x'.repeat(17), 'a-b']) {
      expect(() => parseConfig(JSON.stringify({ servers: [{ ...stdio, platform }] }))).toThrow(ConfigError);
    }
  });

  it('rejects duplicate platforms', () => {
    expect(() => parseConfig(JSON.stringify({ servers: [stdio, stdio] }))).toThrow(/duplicate/);
  });

  it('rejects literal secrets in env and headers', () => {
    expect(() => parseConfig(JSON.stringify({ servers: [{ ...stdio, env: ['ghp_abc123=secret'] }] }))).toThrow(ConfigError);
    expect(() => parseConfig(JSON.stringify({
      servers: [{ platform: 'gh', transport: 'http', url: 'https://e.com/mcp', headers: { Authorization: 'Bearer ghp_literal token' } }],
    }))).toThrow(ConfigError);
  });

  it('rejects credentials embedded in the url and non-http schemes', () => {
    expect(() => parseConfig(JSON.stringify({ servers: [{ platform: 'a', transport: 'http', url: 'https://u:p@e.com/' }] }))).toThrow(ConfigError);
    expect(() => parseConfig(JSON.stringify({ servers: [{ platform: 'a', transport: 'http', url: 'file:///etc/passwd' }] }))).toThrow(ConfigError);
  });

  it('rejects invalid json and unknown transport', () => {
    expect(() => parseConfig('{')).toThrow(ConfigError);
    expect(() => parseConfig(JSON.stringify({ servers: [{ platform: 'a', transport: 'ws' }] }))).toThrow(ConfigError);
  });
});

const http = (over: Record<string, unknown>) =>
  JSON.stringify({ servers: [{ platform: 'gh', transport: 'http', url: 'https://example.com/mcp', ...over }] });
const withStdio = (over: Record<string, unknown>) => JSON.stringify({ servers: [{ ...stdio, ...over }] });

describe('M1 secrets and env names', () => {
  it('rejects lowercase, token-shaped and malformed env names', () => {
    for (const n of ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'lower_case', '1ABC', 'REF-X', 'AKIAABCDEFGHIJKLMNOP']) {
      expect(() => parseConfig(withStdio({ env: [n] }))).toThrow(ConfigError);
    }
  });
  it('never echoes a rejected name in the error', () => {
    const secret = 'ghp_SUPERSECRETVALUE1234567890abcdefgh';
    try {
      parseConfig(withStdio({ env: [secret] }));
      throw new Error('should throw');
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('SUPERSECRET');
      expect((e as Error).message).toContain('invalid env name');
    }
  });
  it('rejects token patterns and high entropy strings in args', () => {
    const base = '/app/upstreams/ref/index.js';
    for (const a of ['ghp_x', 'github_pat_abc', 'sk-ant-abc', 'xoxb-1', 'AKIAABCDEFGHIJKLMNOP', `AIza${'a'.repeat(35)}`, 'a'.repeat(32)]) {
      expect(() => parseConfig(withStdio({ args: [base, a] }))).toThrow(ConfigError);
    }
    expect(() => parseConfig(withStdio({ args: [base, '--task-list', 'stdio'] }))).not.toThrow();
  });
  it('limits header prefix and rejects secret-like prefixes', () => {
    expect(() => parseConfig(http({ headers: { Authorization: { env: 'GH_TOKEN', prefix: 'ghp_abc ' } } }))).toThrow(ConfigError);
    expect(() => parseConfig(http({ headers: { Authorization: { env: 'GH_TOKEN', prefix: 'Basic ' } } }))).not.toThrow();
    expect(() => parseConfig(http({ headers: { Authorization: { env: 'GH_TOKEN', prefix: 'Bearer' } } }))).toThrow(ConfigError);
  });
});

describe('M2 stdio isolation', () => {
  it('allows only baked node scripts or absolute /app paths', () => {
    expect(() => parseConfig(withStdio({ args: ['/app/node_modules/x/index.js'] }))).not.toThrow();
    expect(() => parseConfig(withStdio({ command: '/app/upstreams/bin/srv', args: [] }))).not.toThrow();
  });
  it('rejects npx, uvx, shells, other paths and traversal', () => {
    for (const o of [
      { command: 'npx', args: ['-y', 'pkg@1.0.0'] },
      { command: 'uvx', args: ['pkg'] },
      { command: 'sh', args: ['-c', 'echo'] },
      { command: 'bash', args: [] },
      { command: '/usr/bin/python3', args: [] },
      { command: 'node', args: ['-e', 'x'] },
      { command: 'node', args: ['/tmp/x.js'] },
      { command: 'node', args: ['/app/node_modules/../../etc/x.js'] },
      { command: 'node', args: ['relative.js'] },
      { command: '/app/../bin/sh', args: [] },
      { command: 'node', args: [] },
      { command: '/app/config/local/run.sh', args: [] },
      { command: '/app/config/run.sh', args: [] },
      { command: '/app/run.sh', args: [] },
      { command: '/app/node_modules/.bin/x', args: [] },
      { command: '/app//config/local/run.sh', args: [] },
      { command: '/app/upstreams/../config/local/run.sh', args: [] },
      { command: '/app/upstreams//x', args: [] },
      { command: '/app/upstreams/./x', args: [] },
      { command: '/app/upstreams/x/', args: [] },
      { command: '/app/upstreams/x.', args: [] },
      { command: '/app/upstreams/', args: [] },
      { command: '/app/upstreams/x\\..\\y', args: [] },
      { command: '/app/config', args: [] },
      { command: 'node', args: ['/app/config/local/x.js'] },
      { command: 'node', args: ['/app/config/../upstreams/x.js'] },
      { command: 'node', args: ['/app/upstreams//x.js'] },
      { command: 'node', args: ['/app/upstreams/x.js.'] },
      { command: 'node', args: ['/app/upstreams/./x.js'] },
    ]) {
      expect(() => parseConfig(withStdio(o))).toThrow(ConfigError);
    }
  });
});

describe('L1 tools allow-list', () => {
  it('parses tools and rejects non-string lists', () => {
    expect(parseConfig(withStdio({ tools: ['echo', 'get-sum'] }))[0].tools).toEqual(['echo', 'get-sum']);
    expect(() => parseConfig(withStdio({ tools: 'echo' }))).toThrow(ConfigError);
    expect(() => parseConfig(withStdio({ tools: [1] }))).toThrow(ConfigError);
  });
});

describe('L4 http upstream destinations', () => {
  const hdr = { headers: { Authorization: { env: 'GH_TOKEN', prefix: 'Bearer ' } } };
  it('requires https with headers unless loopback or a single-label service', () => {
    expect(() => parseConfig(http({ ...hdr, url: 'http://example.com/mcp' }))).toThrow(ConfigError);
    expect(() => parseConfig(http({ ...hdr, url: 'http://10.0.0.5/mcp' }))).toThrow(ConfigError);
    expect(() => parseConfig(http({ ...hdr, url: 'http://github-mcp:8082/' }))).not.toThrow();
    expect(() => parseConfig(http({ ...hdr, url: 'http://127.0.0.1:9/' }))).not.toThrow();
    expect(() => parseConfig(http({ ...hdr, url: 'http://localhost:9/' }))).not.toThrow();
    expect(() => parseConfig(http({ url: 'http://example.com/mcp' }))).not.toThrow();
  });
  it('always rejects link-local and metadata hosts', () => {
    for (const url of [
      'http://169.254.169.254/', 'https://169.254.0.1/', 'http://100.100.100.200/',
      'http://[fd00:ec2::254]/', 'http://[fc00::1]/', 'http://[fcff::1]/', 'http://[FC00::1]/', 'http://[fe80::1]/', 'http://metadata.google.internal/',
      'http://[::ffff:169.254.169.254]/', 'http://2852039166/',
    ]) {
      expect(() => parseConfig(http({ url }))).toThrow(ConfigError);
    }
  });
});

describe('L5 env name rules', () => {
  it('denies reserved names and requires the platform prefix', () => {
    for (const n of ['OPENCLAW_TOKEN', 'PORT', 'HOST', 'CONFIG_PATH', 'NODE_OPTIONS', 'PATH', 'LD_PRELOAD']) {
      expect(() => parseConfig(withStdio({ env: [n] }))).toThrow(ConfigError);
    }
    expect(() => parseConfig(withStdio({ env: ['OTHER_TOKEN'] }))).toThrow(/prefix/);
    expect(() => parseConfig(http({ headers: { Authorization: 'OTHER_TOKEN' } }))).toThrow(ConfigError);
    expect(() => parseConfig(http({ headers: { Authorization: 'GH_TOKEN' } }))).not.toThrow();
  });
});

describe('resolveHeaders', () => {
  it('reads values from env and reports missing names only', () => {
    const r = resolveHeaders({ Authorization: { env: 'A', prefix: 'Bearer ' }, 'X-Other': { env: 'B', prefix: '' } }, { A: 'tok' });
    expect(r.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(r.missing).toEqual(['B']);
  });
});

import { describe, it, expect } from 'vitest';
import { parseConfig, resolveHeaders, ConfigError } from '../src/config.js';

const stdio = { platform: 'ref', transport: 'stdio', command: 'node', args: ['x.js'], env: ['TOKEN_A'] };

describe('parseConfig', () => {
  it('parses stdio and http servers', () => {
    const cfg = parseConfig(JSON.stringify({
      servers: [stdio, { platform: 'gh', transport: 'http', url: 'https://example.com/mcp', headers: { Authorization: { env: 'GH_TOKEN', prefix: 'Bearer ' } } }],
    }));
    expect(cfg).toHaveLength(2);
    expect(cfg[0]).toMatchObject({ transport: 'stdio', envNames: ['TOKEN_A'] });
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

describe('resolveHeaders', () => {
  it('reads values from env and reports missing names only', () => {
    const r = resolveHeaders({ Authorization: { env: 'A', prefix: 'Bearer ' }, 'X-Other': { env: 'B', prefix: '' } }, { A: 'tok' });
    expect(r.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(r.missing).toEqual(['B']);
  });
});

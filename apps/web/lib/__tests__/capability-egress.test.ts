import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  EgressDeniedError, createAllowlistedFetch, hostAllowed, isForbiddenAddress, resolveAllowedTarget, scanForUrls, validateAllowlistEntry,
} from '@/lib/capability/egress';

const u = (s: string) => new URL(s);

describe('allow-list entry validation (registration time)', () => {
  it.each(['*', '*.example.com', '0.0.0.0/0', '10.0.0.0/7', 'https://a.test', 'a.test/path', '', 'a b', 'a.test:0', 'a.test:70000'])('rejects %j', (e) => {
    expect(validateAllowlistEntry(e)).not.toBeNull();
  });
  it.each(['api.example.com', 'api.example.com:443', '10.0.0.0/8', '127.0.0.1:8080', '[::1]:3100', '::1', 'EXAMPLE.com'])('accepts %j', (e) => {
    expect(validateAllowlistEntry(e)).toBeNull();
  });
});

describe('hostAllowed', () => {
  it('is deny by default', () => expect(hostAllowed(u('https://a.test/'), [])).toBe(false));
  it('treats default ports as the same destination', () => {
    expect(hostAllowed(u('https://a.test/x'), ['a.test:443'])).toBe(true);
    expect(hostAllowed(u('http://a.test/x'), ['a.test:80'])).toBe(true);
    expect(hostAllowed(u('https://a.test/x'), ['a.test:80'])).toBe(false);
  });
  it('port-qualified entries do not allow other ports; bare hosts allow any port', () => {
    expect(hostAllowed(u('http://a.test:8080/'), ['a.test:8080'])).toBe(true);
    expect(hostAllowed(u('http://a.test:9090/'), ['a.test:8080'])).toBe(false);
    expect(hostAllowed(u('http://a.test:9090/'), ['a.test'])).toBe(true);
  });
  it('is case-insensitive on both sides', () => {
    expect(hostAllowed(u('https://API.Example.com/'), ['api.EXAMPLE.com'])).toBe(true);
  });
  it('handles IPv6 literals', () => {
    expect(hostAllowed(u('http://[::1]:3100/'), ['[::1]:3100'])).toBe(true);
    expect(hostAllowed(u('http://[::1]:3100/'), ['::1'])).toBe(true);
    expect(hostAllowed(u('http://[::2]:3100/'), ['::1'])).toBe(false);
  });
  it('matches IPv4 CIDR only for IP hosts', () => {
    expect(hostAllowed(u('http://10.1.2.3/'), ['10.0.0.0/8'])).toBe(true);
    expect(hostAllowed(u('http://11.1.2.3/'), ['10.0.0.0/8'])).toBe(false);
    expect(hostAllowed(u('http://evil.test/'), ['10.0.0.0/8'])).toBe(false);
  });
  it('an invalid stored entry matches nothing, including a /0 CIDR', () => {
    expect(hostAllowed(u('http://8.8.8.8/'), ['0.0.0.0/0'])).toBe(false);
    expect(hostAllowed(u('http://8.8.8.8/'), ['*'])).toBe(false);
  });
});

describe('forbidden address ranges', () => {
  it.each(['169.254.169.254', '169.254.0.1', '0.0.0.1', '224.0.0.1', '255.255.255.255', 'fe80::1', '::', 'ff02::1', 'fd00:ec2::254', '::ffff:169.254.169.254'])('%s is forbidden', (ip) => {
    expect(isForbiddenAddress(ip)).toBe(true);
  });
  it.each(['127.0.0.1', '10.0.0.5', '8.8.8.8', '::1'])('%s is not in the always-forbidden set', (ip) => {
    expect(isForbiddenAddress(ip)).toBe(false);
  });
});

describe('resolveAllowedTarget', () => {
  it('refuses a listed hostname that resolves to the cloud metadata address', async () => {
    await expect(resolveAllowedTarget(u('https://api.example.com/'), { allowlist: ['api.example.com'] }, { resolve: async () => [{ address: '169.254.169.254', family: 4 }] }))
      .rejects.toBeInstanceOf(EgressDeniedError);
  });
  it('refuses when ANY resolved address is forbidden (mixed answers)', async () => {
    await expect(resolveAllowedTarget(u('https://api.example.com/'), { allowlist: ['api.example.com'] }, { resolve: async () => [{ address: '8.8.8.8', family: 4 }, { address: '169.254.169.254', family: 4 }] }))
      .rejects.toBeInstanceOf(EgressDeniedError);
  });
  it('refuses a name that is not listed, and non-http schemes and URL credentials', async () => {
    const r = async () => [{ address: '8.8.8.8', family: 4 }];
    await expect(resolveAllowedTarget(u('https://other.test/'), { allowlist: ['api.example.com'] }, { resolve: r })).rejects.toBeInstanceOf(EgressDeniedError);
    await expect(resolveAllowedTarget(u('ftp://api.example.com/'), { allowlist: ['api.example.com'] }, { resolve: r })).rejects.toBeInstanceOf(EgressDeniedError);
    await expect(resolveAllowedTarget(u('https://user:pw@api.example.com/'), { allowlist: ['api.example.com'] }, { resolve: r })).rejects.toBeInstanceOf(EgressDeniedError);
  });
  it('accepts a listed name and returns the address to connect to', async () => {
    const t = await resolveAllowedTarget(u('https://api.example.com/'), { allowlist: ['api.example.com'] }, { resolve: async () => [{ address: '93.184.216.34', family: 4 }] });
    expect(t).toEqual({ address: '93.184.216.34', family: 4 });
  });
});

describe('scanForUrls', () => {
  it('finds URLs inside sentences, in keys and in nested arrays', () => {
    const s = scanForUrls({ note: 'send it to http://evil.example/x please', 'https://k.example/': 1, deep: [[{ u: 'wss://w.example/s' }]] });
    expect(s.urls.map((x) => x.hostname).sort()).toEqual(['evil.example', 'k.example', 'w.example']);
    expect(s.incomplete).toBe(false);
  });
  it('does not mistake plain text for URLs', () => {
    const s = scanForUrls({ a: 'note:todo', b: 'time: 10:30', c: 'C:\\Users\\x', d: 'ratio 3:4' });
    expect(s.urls).toHaveLength(0);
    expect(s.incomplete).toBe(false);
  });
  it('fails closed when nesting is too deep to inspect', () => {
    let deep: unknown = { u: 'http://evil.example' };
    for (let i = 0; i < 40; i++) deep = { n: deep };
    expect(scanForUrls(deep).incomplete).toBe(true);
  });
  it('survives a cyclic object', () => {
    const o: Record<string, unknown> = { a: 'http://x.example' };
    o.self = o;
    expect(scanForUrls(o).urls).toHaveLength(1);
  });
});

describe('createAllowlistedFetch (real sockets)', () => {
  let server: http.Server;
  let port = 0;
  const seenHosts: string[] = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seenHosts.push(String(req.headers.host));
      if (req.url === '/redir') { res.statusCode = 302; res.setHeader('location', 'http://169.254.169.254/latest'); res.end(); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, method: req.method }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it('connects to the checked IP and never asks the resolver again (no DNS rebinding window)', async () => {
    let calls = 0;
    // First answer is the allowed loopback IP. A rebinding attacker would answer differently the second time.
    const resolve = async () => { calls++; return calls === 1 ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '169.254.169.254', family: 4 }]; };
    const f = createAllowlistedFetch({ allowlist: [`rebind.test:${port}`, '127.0.0.1'] }, { resolve });
    const res = await f(`http://rebind.test:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(calls).toBe(1);
  });
  it('does not follow redirects: the 3xx is returned as-is', async () => {
    const f = createAllowlistedFetch({ allowlist: [`127.0.0.1:${port}`] });
    const res = await f(`http://127.0.0.1:${port}/redir`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://169.254.169.254/latest');
  });
  it('sends nothing to a destination that is not allow-listed (zero connections)', async () => {
    const before = seenHosts.length;
    const f = createAllowlistedFetch({ allowlist: ['127.0.0.1:1'] });
    await expect(f(`http://127.0.0.1:${port}/`)).rejects.toBeInstanceOf(EgressDeniedError);
    expect(seenHosts.length).toBe(before);
  });
  it('POSTs a body and honours an abort signal', async () => {
    const f = createAllowlistedFetch({ allowlist: [`127.0.0.1:${port}`] });
    const res = await f(`http://127.0.0.1:${port}/`, { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } });
    expect(await res.json()).toMatchObject({ method: 'POST' });
    const ac = new AbortController(); ac.abort();
    await expect(f(`http://127.0.0.1:${port}/`, { signal: ac.signal })).rejects.toBeDefined();
  });
});

// ── Independent security review fixes ──────────────────────────────────────────────────────────────

describe('CG-4 every IPv6 spelling of a forbidden IPv4 address is forbidden', () => {
  it.each([
    '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '64:ff9b::a9fe:a9fe', '::ffff:0:a9fe:a9fe', '::a9fe:a9fe', '2002:a9fe:a9fe::1',
    '[::ffff:a9fe:a9fe]', '100.100.100.200', 'fd00:ec2::254', 'fd00:ec2::1', 'fe80::1', 'ff02::1', '::', '0:0:0:0:0:ffff:a9fe:a9fe',
  ])('forbids %s', (ip) => { expect(isForbiddenAddress(ip)).toBe(true); });
  it.each(['2606:4700:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808', '8.8.8.8', '::1'])('does not forbid %s', (ip) => {
    expect(isForbiddenAddress(ip)).toBe(false); // loopback is handled by the hostname rule below, not by the never-reachable list
  });
  it('a literal metadata URL in IPv6 form is refused even when the Founder lists it', async () => {
    await expect(resolveAllowedTarget(u('https://[::ffff:169.254.169.254]/'), { allowlist: ['[::ffff:a9fe:a9fe]'] })).rejects.toBeInstanceOf(EgressDeniedError);
  });
});

describe('CG-5 a hostname never leads into loopback or private space unless that IP is listed', () => {
  const to = (address: string) => async () => [{ address, family: address.includes(':') ? 6 : 4 }];
  it.each(['127.0.0.1', '10.1.2.3', '172.16.5.5', '192.168.1.10', '100.64.0.9', 'fd12:3456::1', '::1', '::ffff:10.0.0.1'])('refuses api.good.test -> %s', async (addr) => {
    await expect(resolveAllowedTarget(u('https://api.good.test/'), { allowlist: ['api.good.test'] }, { resolve: to(addr) })).rejects.toBeInstanceOf(EgressDeniedError);
  });
  it('allows it when the Founder lists that exact IP or CIDR as well', async () => {
    const t = await resolveAllowedTarget(u('https://api.good.test/'), { allowlist: ['api.good.test', '10.1.2.3'] }, { resolve: to('10.1.2.3') });
    expect(t.address).toBe('10.1.2.3');
    const c = await resolveAllowedTarget(u('https://api.good.test/'), { allowlist: ['api.good.test', '10.0.0.0/8'] }, { resolve: to('10.9.9.9') });
    expect(c.address).toBe('10.9.9.9');
  });
  it('a literal IP the Founder listed still works', async () => {
    const t = await resolveAllowedTarget(u('http://127.0.0.1:3100/mcp'), { allowlist: ['127.0.0.1:3100'] });
    expect(t.address).toBe('127.0.0.1');
  });
  it('"localhost" may reach loopback, and only loopback', async () => {
    expect((await resolveAllowedTarget(u('http://localhost:3100/'), { allowlist: ['localhost:3100'] }, { resolve: to('127.0.0.1') })).address).toBe('127.0.0.1');
    await expect(resolveAllowedTarget(u('http://localhost:3100/'), { allowlist: ['localhost:3100'] }, { resolve: to('10.0.0.5') })).rejects.toBeInstanceOf(EgressDeniedError);
  });
  it('public addresses are unaffected', async () => {
    expect((await resolveAllowedTarget(u('https://api.good.test/'), { allowlist: ['api.good.test'] }, { resolve: to('93.184.216.34') })).address).toBe('93.184.216.34');
  });
});

describe('CG-6 URL scan finds the spellings a URL parser accepts', () => {
  const hostsOf = (v: unknown) => scanForUrls(v).urls.map((x) => x.hostname);
  it.each([
    'http:\\\\evil.example/x', 'https:evil.example/x', 'https:/evil.example/x', '//evil.example/x', 'see (//evil.example/x)', 'https%3A%2F%2Fevil.example%2Fx', 'HTTPS://EVIL.EXAMPLE/x',
  ])('finds %s', (text) => {
    expect(hostsOf({ note: text })).toContain('evil.example');
  });
  it('finds them in keys too', () => { expect(hostsOf({ 'https:evil.example/x': 1 })).toContain('evil.example'); });
  it('still ignores plain text', () => {
    expect(scanForUrls({ a: 'note:todo', b: '10:30', c: '100% sure', d: '// comment', e: '//usr/bin/env', f: 'http: not a url' }).urls).toEqual([]);
  });
  it('documented limit: a bare host with no scheme is not found (the allow-list is the real boundary)', () => {
    expect(scanForUrls({ a: 'evil.example/x' }).urls).toEqual([]);
  });
});

describe('CG-2 response bodies are counted on the wire and cut off at the limit', () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/declared') { res.setHeader('content-length', String(5 * 1024 * 1024)); res.flushHeaders(); res.end(); return; }
      if (req.url === '/stream') {
        // No content-length: chunked, endless-looking. The client must stop reading.
        res.setHeader('content-type', 'text/plain');
        const chunk = Buffer.alloc(16 * 1024, 97);
        let sent = 0;
        const tick = (): void => { if (res.destroyed || sent > 64 * 1024 * 1024) { res.end(); return; } sent += chunk.length; if (res.write(chunk)) setImmediate(tick); else res.once('drain', tick); };
        tick();
        return;
      }
      res.end('small');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => { await new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }); });

  it('refuses up front when content-length is over the limit', async () => {
    const f = createAllowlistedFetch({ allowlist: [`127.0.0.1:${port}`], maxResponseBytes: 1000 });
    await expect(f(`http://127.0.0.1:${port}/declared`)).rejects.toThrow(/too large/);
  });
  it('cuts off a body with no content-length once it passes the limit', async () => {
    const f = createAllowlistedFetch({ allowlist: [`127.0.0.1:${port}`], maxResponseBytes: 100_000 });
    const res = await f(`http://127.0.0.1:${port}/stream`);
    await expect(res.text()).rejects.toThrow(/too large/);
  });
  it('a response under the limit is delivered whole', async () => {
    const f = createAllowlistedFetch({ allowlist: [`127.0.0.1:${port}`], maxResponseBytes: 1000 });
    expect(await (await f(`http://127.0.0.1:${port}/`)).text()).toBe('small');
  });
  it('the default limit is 1 MiB', async () => {
    const f = createAllowlistedFetch({ allowlist: [`127.0.0.1:${port}`] });
    const res = await f(`http://127.0.0.1:${port}/stream`);
    await expect(res.text()).rejects.toThrow(/too large/);
  });
});

/**
 * Phase 2c acceptance gaps: C2 (no apps/web change for a new upstream), C3 (63/64/65 boundary),
 * C6 (live chat path wiring), owner-only gateway tools, and CSP via the real middleware.
 * Permission engine is real; only the MCP client, db, ledger and approvals are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defHash } from '@/lib/tool-definition';

const root = path.resolve(__dirname, '../..');
const listOpenClawTools = vi.fn();
const callOpenClawTool = vi.fn();
const def = (name: string) => ({ name, description: 'd', inputSchema: { type: 'object' } });

async function loadRegistry() {
  process.env.OPENCLAW_ALLOWED_USER_IDS = 'u1';
  vi.doMock('@/config/tool-classes.json', () => ({
    default: { openclaw__ref__echo: { class: 'A', defHash: defHash({ description: 'd', inputSchema: { type: 'object' } }) } },
  }));
  vi.doMock('@/lib/openclaw-client', () => ({ isGatewayConfigured: () => true, listOpenClawTools, callOpenClawTool }));
  vi.doMock('@/lib/db', () => ({
    prisma: {
      action: { create: vi.fn().mockResolvedValue({ id: 'act-1' }) },
      userDelegation: { findFirst: vi.fn().mockResolvedValue(null) },
      delegation: { findFirst: vi.fn().mockResolvedValue(null) },
      userProfile: { findUnique: vi.fn().mockResolvedValue({ autonomyLevel: 5 }) },
    },
  }));
  vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn(), correctMemory: vi.fn(), searchMemory: vi.fn() }));
  vi.doMock('@/lib/ledger', () => ({ recordAction: vi.fn().mockResolvedValue({ id: 'a1' }), recordActionSafe: vi.fn().mockResolvedValue({ id: 'a1' }), updateActionStatus: vi.fn() }));
  vi.doMock('@/lib/approvals', () => ({ createApproval: vi.fn().mockResolvedValue({ id: 'ap1' }) }));
  vi.doMock('@/lib/logger', () => ({ generateCorrelationId: () => 'cid', logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
  return import('@/lib/tool-registry');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('C2 swap test, apps/web side', () => {
  it('no non-test source in apps/web hardcodes an openclaw__<platform>__<action> name', () => {
    let out = '';
    try {
      out = execFileSync('grep', ['-rnE', 'openclaw__[a-z0-9]+__', 'app', 'lib', 'components', 'proxy.ts', '--include=*.ts', '--include=*.tsx'], { cwd: root, encoding: 'utf8' });
    } catch (e) {
      if ((e as { status?: number }).status !== 1) throw e;
    }
    const hits = out.split('\n').filter(Boolean).filter((l) => !l.includes('__tests__/'));
    expect(hits).toEqual([]);
  });

  it('an arbitrary new platform appears end to end with no app change, and defaults to Class C', async () => {
    listOpenClawTools.mockResolvedValue([def('zq9plat__do_thing'), def('zq9plat__read_thing')]);
    const { registerOpenClawTools, executeTool, loadGatewayTools } = await loadRegistry();
    const r = await registerOpenClawTools('u1');
    expect(r.tools.map((t) => t.name)).toEqual(['openclaw__zq9plat__do_thing', 'openclaw__zq9plat__read_thing']);
    const g = await loadGatewayTools('u1');
    expect(g.tools.map((t) => t.name)).toContain('openclaw__zq9plat__do_thing');
    const res = await executeTool('u1', 'openclaw__zq9plat__do_thing', {});
    expect(res.success).toBe(false);
    expect(callOpenClawTool).not.toHaveBeenCalled();
  });
});

describe('C3 full prefixed name boundary', () => {
  // 'openclaw__' is 10 chars, so gateway name 'ref__' + n chars gives 15 + n
  it.each([
    [48, true, 63],
    [49, true, 64],
    [50, false, 65],
  ])('body of %i chars (full name %i) accepted=%s', async (n, ok, total) => {
    const raw = `ref__${'a'.repeat(n)}`;
    expect(`openclaw__${raw}`.length).toBe(total);
    listOpenClawTools.mockResolvedValueOnce([def(raw)]);
    const { registerOpenClawTools } = await loadRegistry();
    const names = (await registerOpenClawTools('u1')).tools.map((t) => t.name);
    if (ok) {
      expect(names).toEqual([`openclaw__${raw}`]);
      expect(names[0]).toMatch(/^[a-z0-9_]{1,64}$/);
    } else {
      expect(names).toEqual([]); // rejected, not truncated
      expect(console.warn).toHaveBeenCalled();
    }
  });
});

describe('C6 live chat path wiring', () => {
  it('messages route resolves chat tools and hands exactly that list to the tool loop', () => {
    const src = readFileSync(path.join(root, 'app/api/conversations/[id]/messages/route.ts'), 'utf8');
    expect(src).toMatch(/const chatTools = await resolveChatTools\(/);
    expect(src).toMatch(/runToolLoop\(\{[^}]*tools: chatTools/s);
    expect(src).not.toMatch(/tools: STANDARD_TOOLS/);
  });
});

describe('owner-only gateway in resolveChatTools (real gateway-access)', () => {
  async function loadChat(userId: string) {
    process.env.OPENCLAW_ALLOWED_USER_IDS = 'owner1';
    const loadGatewayTools = vi.fn().mockResolvedValue({ available: true, tools: [def('openclaw__ref__echo')] });
    vi.doMock('@/lib/tool-registry', () => ({ loadGatewayTools }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe: vi.fn() }));
    vi.doMock('@/lib/social/connections', () => ({ hasActiveConnection: vi.fn().mockResolvedValue(false) }));
    vi.doMock('@/lib/db', () => ({ prisma: { user: { findUnique: vi.fn().mockResolvedValue({ role: 'user' }) }, userProfile: { findUnique: vi.fn().mockResolvedValue({ role: 'user' }) } } }));
    const { resolveChatTools } = await import('@/lib/gateway-chat');
    const std = [def('memory_read')] as any;
    const tools = await resolveChatTools({ userId, standardTools: std, persona: 'WHINK', correlationId: 'c' });
    return { tools, loadGatewayTools };
  }

  it('a non-owner is not handed owner-only tools (loadGatewayTools filters; the mock here returns the full list, so check the real filter in gateway-security)', async () => {
    const { loadGatewayTools } = await loadChat('someone-else');
    expect(loadGatewayTools).toHaveBeenCalledWith('someone-else');
  });

  it('the allow-listed owner sees them', async () => {
    const { tools } = await loadChat('owner1');
    expect(tools.map((t) => t.name)).toEqual(['memory_read', 'openclaw__ref__echo']);
  });
});

describe('CSP through the real proxy', () => {
  async function loadMw(session: unknown) {
    vi.doMock('@/auth', () => ({ auth: (fn: any) => (req: any) => fn(Object.assign(req, { auth: session })) }));
    const mod = await import('@/proxy');
    const { NextRequest } = await import('next/server');
    return { mw: mod.default as (r: any) => Promise<Response>, NextRequest };
  }

  it('sets a nonce-based CSP on a public page and forwards the same nonce to the app', async () => {
    const { mw, NextRequest } = await loadMw(null);
    const res = await mw(new NextRequest('http://localhost:3000/login'));
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("frame-ancestors 'none'");
    // Next forwards request-header overrides via x-middleware-request-* headers
    const fwd = res.headers.get('x-middleware-request-x-nonce');
    expect(fwd).toBeTruthy();
    expect(csp).toContain(`'nonce-${fwd}'`);
  });

  it('sets CSP on an authenticated dashboard route and on the unauthenticated redirect', async () => {
    const authed = await loadMw({ user: { id: 'u1' } });
    const res = await authed.mw(new authed.NextRequest('http://localhost:3000/api/settings'));
    expect(res.headers.get('content-security-policy')).toMatch(/nonce-/);

    vi.resetModules();
    const anon = await loadMw(null);
    const redir = await anon.mw(new anon.NextRequest('http://localhost:3000/dashboard'));
    expect(redir.status).toBeGreaterThanOrEqual(300);
    expect(redir.headers.get('content-security-policy')).toMatch(/nonce-/);
  });

  it('upgrade-insecure-requests follows AUTH_URL scheme, not NODE_ENV', async () => {
    vi.stubEnv('AUTH_URL', 'https://app.example.com');
    let m = await loadMw(null);
    expect((await m.mw(new m.NextRequest('http://localhost:3000/login'))).headers.get('content-security-policy')).toContain('upgrade-insecure-requests');
    vi.resetModules();
    vi.stubEnv('AUTH_URL', 'http://localhost:3000');
    m = await loadMw(null);
    expect((await m.mw(new m.NextRequest('http://localhost:3000/login'))).headers.get('content-security-policy')).not.toContain('upgrade-insecure-requests');
    vi.unstubAllEnvs();
  });

  it('L-6: the matcher never excludes /api paths by extension, and CSRF + CSP run on /api/x.png', async () => {
    const { mw, NextRequest } = await loadMw({ user: { id: 'u1' } });
    const mod = await import('@/proxy');
    const patterns = mod.config.matcher;
    expect(patterns).toContain('/api/:path*');
    const catchAll = new RegExp(`^${patterns.find((p: string) => p.startsWith('/(('))!}$`);
    expect(catchAll.test('/api/files/logo.png')).toBe(false); // covered by the /api/:path* entry instead
    expect(catchAll.test('/logo.png')).toBe(false);
    expect(catchAll.test('/dashboard')).toBe(true);
    const res = await mw(new NextRequest('http://localhost:3000/api/settings/x.png', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
    expect(res.headers.get('content-security-policy')).toMatch(/nonce-/);
  });

  it('uses a different nonce per request', async () => {
    const { mw, NextRequest } = await loadMw(null);
    const a = (await mw(new NextRequest('http://localhost:3000/login'))).headers.get('content-security-policy');
    const b = (await mw(new NextRequest('http://localhost:3000/login'))).headers.get('content-security-policy');
    expect(a).not.toEqual(b);
  });
});

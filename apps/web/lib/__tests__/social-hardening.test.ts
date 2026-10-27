/**
 * 2d review fixes that do not need the real database: redirect origin rules (L7/L8),
 * send_at offsets (L9), scheduled edit failure (L12), TikTok revoke (C2) and signup middleware.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_KEYS = ['SOCIAL_OAUTH_REDIRECT_BASE', 'AUTH_URL', 'NEXTAUTH_URL', 'ENCRYPTION_KEY', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'];

const MOCKED = ['@/auth', '@/lib/db', '@/lib/ledger', '@/lib/approvals', '@/lib/tool-registry', '@/lib/openclaw-client', '@/lib/social/oauth', '@/lib/social/scheduler'];

beforeEach(() => {
  vi.resetModules();
  for (const m of MOCKED) vi.doUnmock(m);
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('L7/L8 redirect origin', () => {
  it('buildRedirectUri: https allowed; http only for localhost and 127.0.0.1', async () => {
    const { buildRedirectUri } = await import('@/lib/social/platforms');
    const cases: Array<[string, string | null]> = [
      ['https://app.example.com', 'https://app.example.com/api/social/x/callback'],
      ['http://localhost:3000', 'http://localhost:3000/api/social/x/callback'],
      ['http://127.0.0.1:3000', 'http://127.0.0.1:3000/api/social/x/callback'],
      ['http://app.example.com', null],
      ['http://192.168.1.5:3000', null],
      ['ftp://app.example.com', null],
      ['not a url', null],
    ];
    for (const [base, want] of cases) {
      process.env.SOCIAL_OAUTH_REDIRECT_BASE = base;
      expect(buildRedirectUri('x'), base).toBe(want);
    }
    delete process.env.SOCIAL_OAUTH_REDIRECT_BASE;
    expect(buildRedirectUri('x')).toBeNull();
  });

  it('connectedAppsUrl never takes an origin from the request: configured base, then AUTH_URL, then NEXTAUTH_URL, else relative', async () => {
    const { connectedAppsUrl } = await import('@/lib/social/platforms');
    const path = '/dashboard/settings/connected-apps?connected=x';
    expect(connectedAppsUrl({ connected: 'x' })).toBe(path); // nothing configured: relative
    process.env.NEXTAUTH_URL = 'https://nextauth.example.com/some/path';
    expect(connectedAppsUrl({ connected: 'x' })).toBe(`https://nextauth.example.com${path}`);
    process.env.AUTH_URL = 'https://auth.example.com';
    expect(connectedAppsUrl({ connected: 'x' })).toBe(`https://auth.example.com${path}`);
    process.env.SOCIAL_OAUTH_REDIRECT_BASE = 'https://base.example.com';
    expect(connectedAppsUrl({ connected: 'x' })).toBe(`https://base.example.com${path}`);
    // An unacceptable configured value (plain http, non-local) is skipped, not trusted.
    process.env.SOCIAL_OAUTH_REDIRECT_BASE = 'http://evil.example.com';
    process.env.AUTH_URL = 'http://also-evil.example.com';
    delete process.env.NEXTAUTH_URL;
    expect(connectedAppsUrl({ connected: 'x' })).toBe(path);
    // The function has no request/host parameter at all.
    expect(connectedAppsUrl.length).toBe(1);
  });

  it('the callback route redirects with a relative Location when nothing is configured, even if Host is hostile', async () => {
    vi.doMock('@/auth', () => ({ auth: async () => null }));
    vi.doMock('@/lib/social/oauth', () => ({ completeCallback: vi.fn() }));
    const { NextRequest } = await import('next/server');
    const { GET } = await import('@/app/api/social/[platform]/callback/route');
    const req = new NextRequest('https://evil.example.net/api/social/x/callback?state=s', { headers: { host: 'evil.example.net' } });
    const res = await GET(req, { params: Promise.resolve({ platform: 'x' }) });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');
    const bad = await GET(req, { params: Promise.resolve({ platform: 'myspace' }) });
    expect(bad.headers.get('location')).toBe('/dashboard/settings/connected-apps?error=unknown_platform');
  });
});

describe('L9 send_at must carry an offset', () => {
  it('refuses a bare local time and a date only; accepts Z and +/-hh:mm', async () => {
    const { parseScheduleInput } = await import('@/lib/social/scheduler');
    const now = new Date('2030-01-01T00:00:00Z');
    const t = (send_at: string) => parseScheduleInput({ platform: 'x', text: 'hi', send_at }, now);
    expect(t('2030-06-01T10:00:00').ok).toBe(false);
    expect(t('2030-06-01T10:00').ok).toBe(false);
    expect(t('2030-06-01').ok).toBe(false);
    expect(t('2030-06-01T10:00:00+0200').ok).toBe(false);
    expect(t('June 1 2030 10:00 T').ok).toBe(false);
    for (const good of ['2030-06-01T10:00:00Z', '2030-06-01T10:00:00.123Z', '2030-06-01T10:00:00+02:00', '2030-06-01T10:00-05:00']) {
      const r = t(good);
      expect(r.ok, good).toBe(true);
    }
    const r = t('2030-06-01T10:00:00+02:00');
    if (r.ok) expect(r.value.send_at).toBe('2030-06-01T08:00:00.000Z');
  });
});

describe('L12 scheduled edit when createApproval throws after the cancel', () => {
  it('returns a clean error: still cancelled, nothing sent, no throw', async () => {
    const row = { id: 's1', userId: 'u1', platform: 'x', status: 'scheduled', args: { text: 'old' }, sendAt: new Date(Date.now() + 3600_000) };
    const updateMany = vi.fn(async () => ({ count: 1 }));
    vi.doMock('@/lib/db', () => ({
      prisma: { scheduledPost: { findFirst: vi.fn(async () => row), updateMany, count: vi.fn(async () => 0) } },
    }));
    vi.doMock('@/lib/ledger', () => ({ recordAction: vi.fn(), recordActionSafe: vi.fn(), updateActionStatus: vi.fn(), countToolExecutions: vi.fn(async () => 0) }));
    vi.doMock('@/lib/approvals', () => ({ createApproval: vi.fn(async () => { throw new Error('db down'); }) }));
    vi.doMock('@/lib/tool-registry', () => ({ loadGatewayTools: vi.fn(async () => ({ available: true, tools: [] })), getGatewayDefHash: () => 'a'.repeat(64) }));
    vi.doMock('@/lib/openclaw-client', () => ({ callOpenClawTool: vi.fn() }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { editScheduledPost } = await import('@/lib/social/scheduler');
    const res = await editScheduledPost('u1', 's1', { text: 'new' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(500);
    expect(res.cancelled).toBe(true);
    expect(res.error).toMatch(/Nothing was sent/);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 's1', userId: 'u1' }), data: expect.objectContaining({ status: 'cancelled' }) }));
  });

  it('the PATCH route turns it into a JSON 500 body (no unhandled exception)', async () => {
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/social/scheduler', () => ({
      cancelScheduledPost: vi.fn(),
      editScheduledPost: vi.fn(async () => ({ ok: false, error: 'cancelled; nothing sent', status: 500, cancelled: true })),
    }));
    const { NextRequest } = await import('next/server');
    const { PATCH } = await import('@/app/api/social/scheduled/[id]/route');
    const res = await PATCH(
      new NextRequest('https://app.test/api/social/scheduled/s1', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x' }) }),
      { params: Promise.resolve({ id: 's1' }) },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'cancelled; nothing sent', cancelled: true });
  });
});

describe('C2 TikTok revoke on disconnect', () => {
  it('has the TikTok revoke endpoint, posts client_key/client_secret/token in the form body, and deletes scheduled rows', async () => {
    process.env.ENCRYPTION_KEY = 'd'.repeat(64);
    process.env.TIKTOK_CLIENT_KEY = 'tk-key';
    process.env.TIKTOK_CLIENT_SECRET = 'tk-secret';
    const { PLATFORM_CONFIG } = await import('@/lib/social/platforms');
    expect(PLATFORM_CONFIG.tiktok.revokeUrl).toBe('https://open.tiktokapis.com/v2/oauth/revoke/');

    const { encryptKey } = await import('@/lib/key-encryption');
    const recordActionSafe = vi.fn();
    const scheduledDelete = vi.fn(async () => ({ count: 2 }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        socialConnection: {
          findFirst: vi.fn(async () => ({ id: 'c1', userId: 'u1', platform: 'tiktok', accessTokenEnc: encryptKey('TT-ACCESS') })),
          deleteMany: vi.fn(async () => ({ count: 1 })),
        },
        scheduledPost: { deleteMany: scheduledDelete },
      },
    }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe }));
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { disconnect } = await import('@/lib/social/connections');
    const out = await disconnect('u1', 'tiktok');
    expect(out.deleted).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://open.tiktokapis.com/v2/oauth/revoke/');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('client_key')).toBe('tk-key');
    expect(body.get('client_secret')).toBe('tk-secret');
    expect(body.get('token')).toBe('TT-ACCESS');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(scheduledDelete).toHaveBeenCalledWith({ where: { userId: 'u1', platform: 'tiktok' } });
    const led = recordActionSafe.mock.calls[0][0];
    expect(led.action).toBe('social_disconnected');
    expect(led.outputSummary).toContain('2 scheduled post(s) deleted');
    expect(JSON.stringify(led)).not.toContain('TT-ACCESS');
  });

  it('a failing revoke never blocks the disconnect', async () => {
    process.env.ENCRYPTION_KEY = 'd'.repeat(64);
    process.env.TIKTOK_CLIENT_KEY = 'k';
    process.env.TIKTOK_CLIENT_SECRET = 's';
    const { encryptKey } = await import('@/lib/key-encryption');
    vi.doMock('@/lib/db', () => ({
      prisma: {
        socialConnection: { findFirst: vi.fn(async () => ({ accessTokenEnc: encryptKey('T') })), deleteMany: vi.fn(async () => ({ count: 1 })) },
        scheduledPost: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      },
    }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe: vi.fn() }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { disconnect } = await import('@/lib/social/connections');
    expect((await disconnect('u1', 'tiktok')).deleted).toBe(true);
  });
});

describe('M2 routes return 503 encryption_not_configured', () => {
  it('social connect route', async () => {
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/db', () => ({ prisma: {} }));
    const { NextRequest } = await import('next/server');
    const { POST } = await import('@/app/api/social/[platform]/connect/route');
    const res = await POST(new NextRequest('https://app.test/api/social/x/connect', { method: 'POST' }), { params: Promise.resolve({ platform: 'x' }) });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'encryption_not_configured' });
  });

  it('BYOK key save route, and nothing is written', async () => {
    const upsert = vi.fn();
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/db', () => ({ prisma: { userApiKey: { upsert, findMany: vi.fn() } } }));
    const { NextRequest } = await import('next/server');
    const { POST } = await import('@/app/api/settings/api-keys/route');
    const res = await POST(new NextRequest('https://app.test/api/settings/api-keys', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'anthropic', key: 'sk-ant-' + 'a'.repeat(30) }),
    }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'encryption_not_configured' });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('middleware: /api/signup is reachable without a session, only exactly', () => {
  async function load() {
    vi.doMock('@/auth', () => ({ auth: (fn: unknown) => fn }));
    const mod = await import('../../proxy');
    const { NextRequest } = await import('next/server');
    return { mw: mod.default as unknown as (req: InstanceType<typeof NextRequest>) => Promise<Response>, NextRequest };
  }
  const post = (NextRequest: typeof import('next/server').NextRequest, path: string, headers: Record<string, string>) =>
    new NextRequest(`http://localhost:3000${path}`, { method: 'POST', headers });

  it('POST /api/signup with a same-origin header and no session passes through (no redirect)', async () => {
    const { mw, NextRequest } = await load();
    const res = await mw(post(NextRequest, '/api/signup', { origin: 'http://localhost:3000' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('CSRF is still enforced on /api/signup: cross-origin and header-less POSTs get 403', async () => {
    const { mw, NextRequest } = await load();
    expect((await mw(post(NextRequest, '/api/signup', { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await mw(post(NextRequest, '/api/signup', { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect((await mw(post(NextRequest, '/api/signup', {}))).status).toBe(403);
  });

  it('/api/signupx and /api/signup/extra are still protected (redirect to login without a session)', async () => {
    const { mw, NextRequest } = await load();
    for (const p of ['/api/signupx', '/api/signup/extra', '/api/signup2']) {
      const res = await mw(post(NextRequest, p, { origin: 'http://localhost:3000' }));
      expect(res.status, p).toBe(307);
      expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/login');
    }
  });
});

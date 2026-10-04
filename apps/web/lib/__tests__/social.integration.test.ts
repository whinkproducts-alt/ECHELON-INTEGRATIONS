/**
 * Integration test of the Phase 2d social stack against the REAL local Postgres.
 *
 * Real: prisma, ledger, permission engine, approvals, tool-registry, OAuth lib, route handlers,
 * scheduler. Mocked: the session (auth), the MCP gateway client, and global fetch (the X token
 * and user endpoints). Throwaway users are created and removed. If Postgres is unreachable or
 * the tables are missing, every test skips. Credentials are never printed.
 *
 * D1 ciphertext only, D2 state/PKCE/redirect rules, D3 no token anywhere, D8 scheduling, D10 tenant isolation.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach, type TestContext } from 'vitest';
import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { SOCIAL_TOOL_DEFS } from './fixtures/social-tool-defs';
import { sanitiseToolDefinition } from '@/lib/tool-definition';

const h = vi.hoisted(() => ({ session: null as string | null, calls: [] as Array<{ name: string; params: unknown; credential?: string }> }));

vi.mock('@/auth', () => ({ auth: async () => (h.session ? { user: { id: h.session } } : null) }));
vi.mock('@/lib/openclaw-client', () => ({
  isGatewayConfigured: () => true,
  listOpenClawTools: vi.fn(async () =>
    SOCIAL_TOOL_DEFS.map((t) => {
      const c = sanitiseToolDefinition({ description: t.description, inputSchema: t.inputSchema });
      if (!c.ok) throw new Error('fixture rejected');
      return { name: t.name, description: c.definition.description, inputSchema: c.definition.inputSchema };
    }),
  ),
  callOpenClawTool: vi.fn(async (name: string, params: unknown, opts: { credential?: string } = {}) => {
    h.calls.push({ name, params, credential: opts.credential });
    return '{"data":[]}';
  }),
}));

const ACCESS = 'AT-plain-aaaa1111';
const REFRESH = 'RT-plain-bbbb2222';
const ALLOWED = 'https://app.test/api/social/x/callback';

type Prisma = typeof import('@/lib/db')['prisma'];
let prisma: Prisma;
let dbUp = false;
let userA = '';
let userB = '';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const logged: string[] = [];

function need(ctx: TestContext) {
  if (!dbUp) ctx.skip();
}

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 7200, scope: 'tweet.read tweet.write' }), { status: 200 });
    }
    if (String(url).endsWith('/users/me')) return new Response(JSON.stringify({ data: { id: '777', username: 'testhandle' } }), { status: 200 });
    return new Response('{}', { status: 404 });
  }));
}

async function startAs(userId: string, platform = 'x'): Promise<{ state: string; url: URL; status: number }> {
  h.session = userId;
  const { POST } = await import('@/app/api/social/[platform]/connect/route');
  const res = await POST(new NextRequest(`https://app.test/api/social/${platform}/connect`, { method: 'POST' }), { params: Promise.resolve({ platform }) });
  if (res.status !== 200) return { state: '', url: new URL('https://none.test'), status: res.status };
  const body = (await res.json()) as { authorizeUrl: string };
  const url = new URL(body.authorizeUrl);
  return { state: url.searchParams.get('state') ?? '', url, status: 200 };
}

async function callbackAs(userId: string | null, platform: string, qs: Record<string, string>): Promise<URL> {
  h.session = userId;
  const { GET } = await import('@/app/api/social/[platform]/callback/route');
  const q = new URLSearchParams(qs).toString();
  const res = await GET(new NextRequest(`https://app.test/api/social/${platform}/callback?${q}`), { params: Promise.resolve({ platform }) });
  return new URL(res.headers.get('location') ?? 'https://none.test');
}

async function connect(userId: string): Promise<void> {
  const s = await startAs(userId);
  const loc = await callbackAs(userId, 'x', { code: 'authcode', state: s.state });
  expect(loc.searchParams.get('connected')).toBe('x');
}

async function rawRow(userId: string) {
  return prisma.$queryRaw<Array<{ accessTokenEnc: string; refreshTokenEnc: string | null; status: string }>>`
    SELECT "accessTokenEnc", "refreshTokenEnc", status FROM social_connections WHERE "userId" = ${userId} AND platform = 'x'`;
}

beforeAll(async () => {
  try {
    ({ prisma } = await import('@/lib/db'));
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rej) => setTimeout(() => rej(new Error('db probe timeout')), 4000)),
    ]);
    await prisma.socialConnection.count({ where: { id: 'probe' } });
    await prisma.oAuthState.count({ where: { id: 'probe' } });
    await prisma.scheduledPost.count({ where: { id: 'probe' } });
    dbUp = true;
  } catch {
    dbUp = false;
    return;
  }
  const a = await prisma.user.create({ data: { email: `social-itest-a-${stamp}@example.test`, name: 'social A' } });
  const b = await prisma.user.create({ data: { email: `social-itest-b-${stamp}@example.test`, name: 'social B' } });
  userA = a.id;
  userB = b.id;
  process.env.X_CLIENT_ID = 'itest-client';
  process.env.X_CLIENT_SECRET = 'itest-secret';
  process.env.SOCIAL_OAUTH_REDIRECT_BASE = 'https://app.test';
  process.env.SOCIAL_OAUTH_REDIRECT_ALLOWLIST = ALLOWED;
  delete process.env.OPENCLAW_ALLOWED_USER_IDS;
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logged.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); });
  }
  stubFetch();
  const { registerOpenClawTools } = await import('@/lib/tool-registry');
  await registerOpenClawTools(userA);
}, 15000);

afterEach(() => {
  h.calls.length = 0;
});

afterAll(async () => {
  if (!dbUp) return;
  const ids = [userA, userB].filter(Boolean);
  try {
    await prisma.scheduledPost.deleteMany({ where: { userId: { in: ids } } });
    await prisma.socialConnection.deleteMany({ where: { userId: { in: ids } } });
    await prisma.oAuthState.deleteMany({ where: { userId: { in: ids } } });
    await prisma.approvalRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.action.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } finally {
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  }
}, 15000);

describe('D2 OAuth start, state and PKCE', () => {
  it('returns a PKCE S256 challenge that matches the stored (encrypted) verifier, and stores only the state hash', async (ctx) => {
    need(ctx);
    const s = await startAs(userA);
    expect(s.status).toBe(200);
    expect(s.url.origin + s.url.pathname).toBe('https://x.com/i/oauth2/authorize');
    expect(s.url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(s.url.searchParams.get('redirect_uri')).toBe(ALLOWED);
    expect(s.url.searchParams.get('response_type')).toBe('code');
    expect(s.url.searchParams.get('client_id')).toBe('itest-client');
    expect(s.url.searchParams.get('scope')).toContain('offline.access');
    expect(s.state.length).toBeGreaterThanOrEqual(40);

    const hash = createHash('sha256').update(s.state).digest('hex');
    const row = await prisma.oAuthState.findFirst({ where: { stateHash: hash, userId: userA } });
    expect(row).not.toBeNull();
    const { decryptKey } = await import('@/lib/key-encryption');
    const verifier = decryptKey(row!.codeVerifierEnc);
    expect(row!.codeVerifierEnc).not.toContain(verifier);
    const challenge = createHash('sha256').update(verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(s.url.searchParams.get('code_challenge')).toBe(challenge);
    // 10 minute life
    const life = row!.expiresAt.getTime() - row!.createdAt.getTime();
    expect(life).toBe(10 * 60_000);
    // The state itself is stored nowhere in plaintext.
    const dump = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM oauth_states WHERE "stateHash" = ${s.state} OR "redirectUri" = ${s.state}`;
    expect(Number(dump[0].n)).toBe(0);
  });

  it('unknown platform is 400; unconfigured platform is 503 platform_not_configured', async (ctx) => {
    need(ctx);
    h.session = userA;
    const { POST } = await import('@/app/api/social/[platform]/connect/route');
    const bad = await POST(new NextRequest('https://app.test/api/social/myspace/connect', { method: 'POST' }), { params: Promise.resolve({ platform: 'myspace' }) });
    expect(bad.status).toBe(400);
    const ig = await POST(new NextRequest('https://app.test/api/social/instagram/connect', { method: 'POST' }), { params: Promise.resolve({ platform: 'instagram' }) });
    expect(ig.status).toBe(503);
    expect(await ig.json()).toEqual({ error: 'platform_not_configured' });
  });

  it('unauthenticated connect is 401', async (ctx) => {
    need(ctx);
    h.session = null;
    const { POST } = await import('@/app/api/social/[platform]/connect/route');
    const res = await POST(new NextRequest('https://app.test/api/social/x/connect', { method: 'POST' }), { params: Promise.resolve({ platform: 'x' }) });
    expect(res.status).toBe(401);
  });

  it('rejects a redirect URI that is not on the allow-list (at start)', async (ctx) => {
    need(ctx);
    process.env.SOCIAL_OAUTH_REDIRECT_ALLOWLIST = 'https://other.test/api/social/x/callback';
    try {
      const s = await startAs(userA);
      expect(s.status).toBe(400);
    } finally {
      process.env.SOCIAL_OAUTH_REDIRECT_ALLOWLIST = ALLOWED;
    }
  });

  it('rejects at callback when the redirect URI has left the allow-list since start, and burns the state', async (ctx) => {
    need(ctx);
    const s = await startAs(userA);
    process.env.SOCIAL_OAUTH_REDIRECT_ALLOWLIST = 'https://other.test/api/social/x/callback';
    try {
      const loc = await callbackAs(userA, 'x', { code: 'c', state: s.state });
      expect(loc.searchParams.get('error')).toBe('redirect_not_allowed');
    } finally {
      process.env.SOCIAL_OAUTH_REDIRECT_ALLOWLIST = ALLOWED;
    }
    const loc2 = await callbackAs(userA, 'x', { code: 'c', state: s.state });
    expect(loc2.searchParams.get('error')).toBe('invalid_state');
  });

  it('callback rejects a missing state and a mismatched state', async (ctx) => {
    need(ctx);
    await startAs(userA);
    expect((await callbackAs(userA, 'x', { code: 'c' })).searchParams.get('error')).toBe('missing_params');
    expect((await callbackAs(userA, 'x', { code: 'c', state: 'not-a-real-state' })).searchParams.get('error')).toBe('invalid_state');
    expect(h.calls).toEqual([]);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/oauth2/token'))).toHaveLength(0);
  });

  it('callback rejects a reused state (single use)', async (ctx) => {
    need(ctx);
    const s = await startAs(userA);
    const first = await callbackAs(userA, 'x', { code: 'c', state: s.state });
    expect(first.searchParams.get('connected')).toBe('x');
    const second = await callbackAs(userA, 'x', { code: 'c', state: s.state });
    expect(second.searchParams.get('error')).toBe('invalid_state');
  });

  it('callback rejects an expired state (older than 10 minutes)', async (ctx) => {
    need(ctx);
    const s = await startAs(userA);
    await prisma.oAuthState.updateMany({
      where: { stateHash: createHash('sha256').update(s.state).digest('hex'), userId: userA },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const loc = await callbackAs(userA, 'x', { code: 'c', state: s.state });
    expect(loc.searchParams.get('error')).toBe('invalid_state');
  });

  it('callback rejects another user\'s state without consuming it', async (ctx) => {
    need(ctx);
    const s = await startAs(userA);
    const stolen = await callbackAs(userB, 'x', { code: 'c', state: s.state });
    expect(stolen.searchParams.get('error')).toBe('invalid_state');
    expect(await prisma.socialConnection.count({ where: { userId: userB } })).toBe(0);
    // A can still use it.
    const ok = await callbackAs(userA, 'x', { code: 'c', state: s.state });
    expect(ok.searchParams.get('connected')).toBe('x');
  });

  it('callback rejects a state issued for a different platform', async (ctx) => {
    need(ctx);
    const s = await startAs(userA);
    const loc = await callbackAs(userA, 'instagram', { code: 'c', state: s.state });
    expect(loc.searchParams.get('error')).toBe('invalid_state');
    const ok = await callbackAs(userA, 'x', { code: 'c', state: s.state });
    expect(ok.searchParams.get('connected')).toBe('x');
  });

  it('an unauthenticated callback redirects to login and changes nothing', async (ctx) => {
    need(ctx);
    const s = await startAs(userA);
    const loc = await callbackAs(null, 'x', { code: 'c', state: s.state });
    expect(loc.pathname).toBe('/login');
    const row = await prisma.oAuthState.findFirst({ where: { stateHash: createHash('sha256').update(s.state).digest('hex') } });
    expect(row?.usedAt).toBeNull();
  });
});

describe('D1 ciphertext only, D3 no token anywhere', () => {
  it('stores only ciphertext, and no token reaches a response, redirect, ledger row, approval or log line', async (ctx) => {
    need(ctx);
    logged.length = 0;
    await prisma.socialConnection.deleteMany({ where: { userId: userA } });
    await connect(userA);

    // D1: a direct database query shows only ciphertext.
    const rows = await rawRow(userA);
    expect(rows).toHaveLength(1);
    expect(rows[0].accessTokenEnc).not.toContain(ACCESS);
    expect(rows[0].refreshTokenEnc ?? '').not.toContain(REFRESH);
    expect(rows[0].accessTokenEnc).toMatch(/^[0-9a-f]{56,}$/);
    const { decryptKey } = await import('@/lib/key-encryption');
    expect(decryptKey(rows[0].accessTokenEnc)).toBe(ACCESS);
    expect(decryptKey(rows[0].refreshTokenEnc!)).toBe(REFRESH);

    // Whole-table scan for plaintext.
    const scan = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM social_connections WHERE "userId" = ${userA} AND (position(${ACCESS} in "accessTokenEnc") > 0 OR position(${REFRESH} in coalesce("refreshTokenEnc", '')) > 0)`;
    expect(Number(scan[0].n)).toBe(0);

    // D3: API responses.
    h.session = userA;
    const { GET } = await import('@/app/api/social/connections/route');
    const listRes = await GET();
    const listText = await listRes.text();
    expect(listText).not.toContain(ACCESS);
    expect(listText).not.toContain(REFRESH);
    expect(listText).not.toMatch(/Enc|token/i);
    const parsed = JSON.parse(listText) as { connections: Array<{ platform: string; status: string; handle: string | null; scopes: string[] }> };
    expect(parsed.connections.map((c) => c.platform)).toEqual(['x', 'instagram', 'tiktok']);
    const x = parsed.connections[0];
    expect(x.status).toBe('connected');
    expect(x.handle).toBe('testhandle');
    expect(parsed.connections[1].status).toBe('not_connected');

    // Run a read and a write request so the ledger and approvals hold real social rows.
    const { executeTool } = await import('@/lib/tool-registry');
    const read = await executeTool(userA, 'openclaw__x__read_mentions', { max_results: 5 });
    expect(read.success).toBe(true);
    expect(h.calls[0].credential).toContain(ACCESS); // only the call option carries it
    expect(JSON.stringify(h.calls[0].params)).not.toContain(ACCESS);
    const write = await executeTool(userA, 'openclaw__x__post', { text: 'hello' });
    expect(write.approvalRequired).toBeDefined();

    const actions = await prisma.action.findMany({ where: { userId: userA } });
    const approvals = await prisma.approvalRequest.findMany({ where: { userId: userA } });
    const everything = JSON.stringify([actions, approvals, read, write]) + logged.join('\n');
    expect(everything).not.toContain(ACCESS);
    expect(everything).not.toContain(REFRESH);
    expect(actions.some((r) => r.action === 'social_connected')).toBe(true);
  }, 20000);
});

describe('D10 tenant isolation', () => {
  it('user B cannot list, use or disconnect user A\'s connection', async (ctx) => {
    need(ctx);
    await prisma.socialConnection.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await connect(userA);

    // list
    h.session = userB;
    const { GET } = await import('@/app/api/social/connections/route');
    const list = (await (await GET()).json()) as { connections: Array<{ platform: string; status: string; handle: string | null }> };
    expect(list.connections.every((c) => c.status === 'not_connected' && c.handle === null)).toBe(true);

    // use
    const { executeTool } = await import('@/lib/tool-registry');
    h.calls.length = 0;
    const res = await executeTool(userB, 'openclaw__x__read_home_timeline', {});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/^not_connected/);
    expect(h.calls).toEqual([]);
    const wr = await executeTool(userB, 'openclaw__x__post', { text: 'as A?' });
    expect(wr.error).toMatch(/^not_connected/);
    expect(wr.approvalRequired).toBeUndefined();

    // disconnect
    const { DELETE } = await import('@/app/api/social/[platform]/connection/route');
    const del = await DELETE(new NextRequest('https://app.test/api/social/x/connection', { method: 'DELETE' }), { params: Promise.resolve({ platform: 'x' }) });
    expect(del.status).toBe(200);
    expect(await rawRow(userA)).toHaveLength(1);

    // A's own use still works, and A can disconnect for real.
    h.session = userA;
    const ok = await executeTool(userA, 'openclaw__x__read_home_timeline', {});
    expect(ok.success).toBe(true);
    const delA = await DELETE(new NextRequest('https://app.test/api/social/x/connection', { method: 'DELETE' }), { params: Promise.resolve({ platform: 'x' }) });
    expect(delA.status).toBe(200);
    expect(await delA.json()).toEqual({ ok: true });
    expect(await rawRow(userA)).toHaveLength(0);
    const ledger = await prisma.action.findMany({ where: { userId: userA, action: 'social_disconnected' } });
    expect(ledger).toHaveLength(1);
    // B's disconnect attempt was ledgered under B, not A.
    expect(await prisma.action.count({ where: { userId: userB, action: 'social_disconnected' } })).toBe(1);
  }, 20000);

  it('user B cannot list, cancel or edit user A\'s scheduled posts', async (ctx) => {
    need(ctx);
    const { cancelScheduledPost, editScheduledPost, listScheduledPosts } = await import('@/lib/social/scheduler');
    const row = await prisma.scheduledPost.create({
      data: { userId: userA, approvalId: `fake-${stamp}-iso`, platform: 'x', tool: 'openclaw__x__post', args: { text: 'a' }, contentHash: 'h', sendAt: new Date(Date.now() + 3600_000) },
    });
    expect((await listScheduledPosts(userB)).map((r) => r.id)).not.toContain(row.id);
    expect(await cancelScheduledPost(userB, row.id)).toBe(false);
    const edit = await editScheduledPost(userB, row.id, { text: 'x' });
    expect(edit.ok).toBe(false);
    expect((await prisma.scheduledPost.findFirst({ where: { id: row.id } }))?.status).toBe('scheduled');
  });
});

describe('D8 scheduling', () => {
  async function scheduleAndApprove(text: string) {
    const { executeTool } = await import('@/lib/tool-registry');
    const { decide } = await import('@/lib/approvals');
    const res = await executeTool(userA, 'social_schedule_post', { platform: 'x', text, send_at: new Date(Date.now() + 3600_000).toISOString() });
    expect(res.approvalRequired?.kind).toBe('scheduled_post');
    const out = await decide(userA, res.approvalRequired!.id, 'approve');
    expect(out.status).toBe('EXECUTED');
    const row = await prisma.scheduledPost.findFirst({ where: { userId: userA, approvalId: res.approvalRequired!.id } });
    expect(row).not.toBeNull();
    return row!;
  }
  const makeDue = (id: string) => prisma.scheduledPost.updateMany({ where: { id, userId: userA }, data: { sendAt: new Date(Date.now() - 1000) } });

  it('approval at schedule time stores the row but sends nothing; the worker sends once when due', async (ctx) => {
    need(ctx);
    await prisma.socialConnection.deleteMany({ where: { userId: userA } });
    await connect(userA);
    h.calls.length = 0;
    const { processDueScheduledPosts } = await import('@/lib/social/scheduler');
    const row = await scheduleAndApprove('scheduled hello');
    expect(row.status).toBe('scheduled');
    expect(h.calls).toEqual([]);
    await processDueScheduledPosts(); // not due
    expect(h.calls).toEqual([]);

    await makeDue(row.id);
    // Two concurrent worker passes: exactly one send.
    await Promise.all([processDueScheduledPosts(), processDueScheduledPosts()]);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].name).toBe('x__post');
    expect(h.calls[0].params).toEqual({ text: 'scheduled hello' });
    expect(JSON.parse(h.calls[0].credential ?? '{}').access_token).toBe(ACCESS);
    const after = await prisma.scheduledPost.findFirst({ where: { id: row.id } });
    expect(after?.status).toBe('sent');
    await processDueScheduledPosts();
    expect(h.calls).toHaveLength(1);
    const rows = await prisma.action.findMany({ where: { userId: userA, action: 'tool_executed: openclaw__x__post' } });
    expect(rows.some((r) => r.status === 'VALIDATED' && r.initiator === 'automation')).toBe(true);
  }, 20000);

  it('the approval window (30 s) limits approval, not the send time: an old approval still sends when due', async (ctx) => {
    need(ctx);
    const { processDueScheduledPosts } = await import('@/lib/social/scheduler');
    const row = await scheduleAndApprove('late send');
    await prisma.approvalRequest.updateMany({ where: { id: row.approvalId, userId: userA }, data: { expiresAt: new Date(Date.now() - 3600_000), decidedAt: new Date(Date.now() - 3600_000 - 1000) } });
    await makeDue(row.id);
    h.calls.length = 0;
    await processDueScheduledPosts();
    expect(h.calls).toHaveLength(1);
  }, 20000);

  it('edited content after approval: hash mismatch fails the send, nothing goes out, security event written', async (ctx) => {
    need(ctx);
    const { processDueScheduledPosts } = await import('@/lib/social/scheduler');
    const row = await scheduleAndApprove('approved text');
    await prisma.scheduledPost.updateMany({ where: { id: row.id, userId: userA }, data: { args: { text: 'EVIL text' }, sendAt: new Date(Date.now() - 1000) } });
    h.calls.length = 0;
    await processDueScheduledPosts();
    expect(h.calls).toEqual([]);
    const after = await prisma.scheduledPost.findFirst({ where: { id: row.id } });
    expect(after?.status).toBe('failed');
    const ev = await prisma.action.findMany({ where: { userId: userA, action: 'SECURITY_EVENT: scheduled_post_hash_mismatch' } });
    expect(ev.length).toBeGreaterThanOrEqual(1);
  }, 20000);

  it('even if the row hash is rewritten to match the edit, the approved content still blocks the send', async (ctx) => {
    need(ctx);
    const { processDueScheduledPosts } = await import('@/lib/social/scheduler');
    const { toolArgsHash } = await import('@/lib/canonical-json');
    const row = await scheduleAndApprove('approved text 2');
    const evil = { text: 'EVIL text 2' };
    await prisma.scheduledPost.updateMany({
      where: { id: row.id, userId: userA },
      data: { args: evil, contentHash: toolArgsHash({ tool: row.tool, args: evil }), sendAt: new Date(Date.now() - 1000) },
    });
    h.calls.length = 0;
    await processDueScheduledPosts();
    expect(h.calls).toEqual([]);
    expect((await prisma.scheduledPost.findFirst({ where: { id: row.id } }))?.status).toBe('failed');
  }, 20000);

  it('a cancelled post is never sent', async (ctx) => {
    need(ctx);
    const { processDueScheduledPosts, cancelScheduledPost } = await import('@/lib/social/scheduler');
    const row = await scheduleAndApprove('to cancel');
    expect(await cancelScheduledPost(userA, row.id)).toBe(true);
    expect(await cancelScheduledPost(userA, row.id)).toBe(false);
    await prisma.scheduledPost.updateMany({ where: { id: row.id, userId: userA }, data: { sendAt: new Date(Date.now() - 1000) } });
    h.calls.length = 0;
    await processDueScheduledPosts();
    expect(h.calls).toEqual([]);
    expect(await prisma.action.count({ where: { userId: userA, action: 'scheduled_post_cancelled' } })).toBeGreaterThanOrEqual(1);
  }, 20000);

  it('editing = cancel the old post and raise a NEW approval; the old approval cannot cover the new text', async (ctx) => {
    need(ctx);
    const { editScheduledPost } = await import('@/lib/social/scheduler');
    const row = await scheduleAndApprove('before edit');
    const res = await editScheduledPost(userA, row.id, { text: 'after edit' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.approval.kind).toBe('scheduled_post');
    expect(res.approval.id).not.toBe(row.approvalId);
    expect((res.approval.params as { args: { text: string } }).args.text).toBe('after edit');
    expect((await prisma.scheduledPost.findFirst({ where: { id: row.id } }))?.status).toBe('cancelled');
    // Nothing is scheduled for the new approval until a human approves it.
    expect(await prisma.scheduledPost.count({ where: { userId: userA, approvalId: res.approval.id } })).toBe(0);
    // A second edit of the (now cancelled) post is refused.
    const again = await editScheduledPost(userA, row.id, { text: 'again' });
    expect(again).toMatchObject({ ok: false, status: 409 });
  }, 20000);

  it('a denied schedule approval creates no row', async (ctx) => {
    need(ctx);
    const { executeTool } = await import('@/lib/tool-registry');
    const { decide } = await import('@/lib/approvals');
    const res = await executeTool(userA, 'social_schedule_post', { platform: 'x', text: 'nope', send_at: new Date(Date.now() + 3600_000).toISOString() });
    const out = await decide(userA, res.approvalRequired!.id, 'deny');
    expect(out.status).toBe('DENIED');
    expect(await prisma.scheduledPost.count({ where: { userId: userA, approvalId: res.approvalRequired!.id } })).toBe(0);
  }, 20000);

  it('disconnecting cancels the user\'s scheduled posts for that platform', async (ctx) => {
    need(ctx);
    const row = await scheduleAndApprove('will be cancelled by disconnect');
    const { disconnect } = await import('@/lib/social/connections');
    await disconnect(userA, 'x');
    expect((await prisma.scheduledPost.findFirst({ where: { id: row.id } }))?.status).toBe('cancelled');
    await connect(userA); // restore for any later test
  }, 20000);
});

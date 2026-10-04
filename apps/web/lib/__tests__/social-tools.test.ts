/**
 * Phase 2d: social tools through the real tool registry, permission engine and
 * credential path. Mocked at the boundary: MCP client, db, ledger, approvals.
 *
 * D5 not_connected with no gateway call, D6 every write tool is Class C at every autonomy level
 * even with a delegation, D7 no TikTok DM tools, credential only via the call option, refresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import config from '@/config/tool-classes.json';
import { defHash, sanitiseToolDefinition } from '@/lib/tool-definition';
import { approvalContentHash } from '@/lib/canonical-json';
import { encryptKey, decryptKey } from '@/lib/key-encryption';
import { SOCIAL_TOOL_DEFS } from './fixtures/social-tool-defs';

const listOpenClawTools = vi.fn();
const callOpenClawTool = vi.fn();
const createApproval = vi.fn();
const recordAction = vi.fn();
const recordActionSafe = vi.fn();
const updateActionStatus = vi.fn();
const autonomy = { level: 1 };
const conn = { current: null as null | Record<string, unknown> };
const socialUpdateMany = vi.fn();
const approvalFindFirst = vi.fn();
const approvalUpdateMany = vi.fn();

const READS = ['x__read_home_timeline', 'x__read_mentions', 'x__read_dms', 'instagram__read_media', 'instagram__read_comments', 'tiktok__read_videos'];
const WRITES = ['x__post', 'x__reply', 'x__send_dm', 'x__follow', 'x__unfollow', 'x__delete_post', 'instagram__publish_post', 'instagram__reply_comment', 'tiktok__publish_video'];

const sanitised = SOCIAL_TOOL_DEFS.map((t) => {
  const c = sanitiseToolDefinition({ description: t.description, inputSchema: t.inputSchema });
  if (!c.ok) throw new Error(`fixture ${t.name} rejected`);
  return { name: t.name, description: c.definition.description, inputSchema: c.definition.inputSchema };
});

function activeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c1', userId: 'u2', platform: 'x', status: 'active',
    accessTokenEnc: encryptKey('AT-secret-111'), refreshTokenEnc: encryptKey('RT-secret-222'),
    expiresAt: new Date(Date.now() + 3600_000), platformUserId: '42', platformHandle: 'h', scopes: 'tweet.read', createdAt: new Date(),
    ...over,
  };
}

async function load() {
  vi.doMock('@/lib/openclaw-client', () => ({ isGatewayConfigured: () => true, listOpenClawTools, callOpenClawTool }));
  vi.doMock('@/lib/db', () => ({
    prisma: {
      userProfile: { findUnique: vi.fn(async () => ({ autonomyLevel: autonomy.level })) },
      delegation: { findFirst: vi.fn(async () => ({ id: 'd1', isActive: true })) }, // a delegation always exists
      socialConnection: {
        findFirst: vi.fn(async () => conn.current),
        count: vi.fn(async () => (conn.current && conn.current.status === 'active' ? 1 : 0)),
        updateMany: socialUpdateMany,
      },
      approvalRequest: { findFirst: approvalFindFirst, updateMany: approvalUpdateMany },
    },
  }));
  vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn(), correctMemory: vi.fn(), searchMemory: vi.fn() }));
  vi.doMock('@/lib/ledger', () => ({ recordAction, recordActionSafe, updateActionStatus }));
  vi.doMock('@/lib/approvals', () => ({ createApproval }));
  vi.doMock('@/lib/logger', () => ({ generateCorrelationId: () => 'cid', logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), security: vi.fn() } }));
  return import('@/lib/tool-registry');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.OPENCLAW_ALLOWED_USER_IDS = 'owner-only';
  process.env.X_CLIENT_ID = 'cid';
  process.env.X_CLIENT_SECRET = 'csecret';
  autonomy.level = 1;
  conn.current = activeRow();
  listOpenClawTools.mockResolvedValue(sanitised);
  callOpenClawTool.mockResolvedValue('{"data":[]}');
  createApproval.mockResolvedValue({ id: 'ap1' });
  recordAction.mockResolvedValue({ id: 'a1' });
  recordActionSafe.mockResolvedValue({ id: 'a1' });
  socialUpdateMany.mockResolvedValue({ count: 1 });
  approvalUpdateMany.mockResolvedValue({ count: 1 });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.OPENCLAW_ALLOWED_USER_IDS;
});

describe('class map and definition binding', () => {
  it('the six read tools are Class A in config, bound to the hash of the upstream definition', () => {
    const cfg = config as unknown as Record<string, { class: string; defHash: string }>;
    for (const r of READS) {
      const def = sanitised.find((t) => t.name === r)!;
      expect(cfg[`openclaw__${r}`]).toEqual({ class: 'A', defHash: defHash({ description: def.description, inputSchema: def.inputSchema }) });
    }
  });

  it('no write tool is in the class map: all default to Class C', () => {
    const cfg = config as unknown as Record<string, unknown>;
    for (const w of WRITES) expect(cfg[`openclaw__${w}`]).toBeUndefined();
  });

  it('D7: TikTok exposes no direct message tools', () => {
    const tiktok = SOCIAL_TOOL_DEFS.filter((t) => t.name.startsWith('tiktok__')).map((t) => t.name);
    expect(tiktok.some((n) => /dm|message/i.test(n))).toBe(false);
  });
});

describe('gateway access rules', () => {
  it('social platforms are open to any authenticated user, other platforms stay owner-only', async () => {
    const { canUseGatewayTool, socialPlatformOf } = await import('@/lib/gateway-access');
    expect(socialPlatformOf('openclaw__x__post')).toBe('x');
    expect(socialPlatformOf('openclaw__tiktok__read_videos')).toBe('tiktok');
    expect(socialPlatformOf('openclaw__ref__echo')).toBeNull();
    expect(socialPlatformOf('openclaw__x')).toBeNull();
    expect(socialPlatformOf('memory_read')).toBeNull();
    expect(await canUseGatewayTool('someone', 'openclaw__x__read_mentions')).toBe(true);
    expect(await canUseGatewayTool('someone', 'openclaw__ref__echo')).toBe(false);
    expect(await canUseGatewayTool('owner-only', 'openclaw__ref__echo')).toBe(true);
    expect(await canUseGatewayTool('', 'openclaw__x__read_mentions')).toBe(false);
  });

  it('a non-owner sees the social tools and nothing else from the gateway', async () => {
    listOpenClawTools.mockResolvedValue([...sanitised, { name: 'ref__echo', description: 'e', inputSchema: { type: 'object' } }]);
    const { loadGatewayTools } = await load();
    const r = await loadGatewayTools('u2');
    expect(r.tools.every((t) => t.name.startsWith('openclaw__x__') || t.name.startsWith('openclaw__instagram__') || t.name.startsWith('openclaw__tiktok__'))).toBe(true);
    expect(r.tools.length).toBe(sanitised.length);
  });
});

describe('credential path', () => {
  it('a Class A read passes the decrypted credential as a call option only, never in params', async () => {
    const { registerOpenClawTools, executeTool } = await load();
    await registerOpenClawTools('u2');
    const res = await executeTool('u2', 'openclaw__x__read_mentions', { max_results: 10 });
    expect(res.success).toBe(true);
    expect(callOpenClawTool).toHaveBeenCalledTimes(1);
    const [name, params, opts] = callOpenClawTool.mock.calls[0];
    expect(name).toBe('x__read_mentions');
    expect(params).toEqual({ max_results: 10 });
    expect(JSON.parse(opts.credential)).toEqual({ access_token: 'AT-secret-111', platform_user_id: '42' });
    const everything = JSON.stringify([recordAction.mock.calls, recordActionSafe.mock.calls, updateActionStatus.mock.calls, res]);
    expect(everything).not.toContain('AT-secret-111');
    expect(everything).not.toContain('RT-secret-222');
  });

  it.each(READS)('D5: %s with no connection returns not_connected, ledgers it, makes no gateway call', async (tool) => {
    conn.current = null;
    const { registerOpenClawTools, executeTool } = await load();
    await registerOpenClawTools('u2');
    callOpenClawTool.mockClear();
    const res = await executeTool('u2', `openclaw__${tool}`, {});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/^not_connected/);
    expect(callOpenClawTool).not.toHaveBeenCalled();
    expect(recordAction).toHaveBeenCalled(); // write-ahead row
    expect(updateActionStatus.mock.calls.at(-1)?.[2]).toMatchObject({ status: 'FAILED' });
    expect(String(updateActionStatus.mock.calls.at(-1)?.[2].outputSummary)).toMatch(/not_connected/);
  });

  it('an expired connection is not_connected too, with no gateway call', async () => {
    conn.current = activeRow({ status: 'expired' });
    const { registerOpenClawTools, executeTool } = await load();
    await registerOpenClawTools('u2');
    const res = await executeTool('u2', 'openclaw__x__read_dms', {});
    expect(res.error).toMatch(/^not_connected.*expired/);
    expect(callOpenClawTool).not.toHaveBeenCalled();
  });

  it('refreshes an expired access token atomically, stores only ciphertext, then calls with the new token', async () => {
    conn.current = activeRow({ expiresAt: new Date(Date.now() - 1000) });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: 'AT-new-999', refresh_token: 'RT-new-888', expires_in: 7200 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { registerOpenClawTools, executeTool } = await load();
    await registerOpenClawTools('u2');
    const res = await executeTool('u2', 'openclaw__x__read_mentions', {});
    expect(res.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.x.com/2/oauth2/token');
    expect(String(init.body)).toContain('grant_type=refresh_token');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    const upd = socialUpdateMany.mock.calls[0][0];
    expect(upd.where).toMatchObject({ id: 'c1', userId: 'u2', refreshTokenEnc: (conn.current as { refreshTokenEnc: string }).refreshTokenEnc });
    expect(upd.data.accessTokenEnc).not.toContain('AT-new-999');
    expect(decryptKey(upd.data.accessTokenEnc)).toBe('AT-new-999');
    expect(decryptKey(upd.data.refreshTokenEnc)).toBe('RT-new-888');
    expect(JSON.parse(callOpenClawTool.mock.calls[0][2].credential).access_token).toBe('AT-new-999');
  });

  it('refresh failure marks the connection expired and returns not_connected with no gateway call', async () => {
    conn.current = activeRow({ expiresAt: new Date(Date.now() - 1000) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 })));
    const { registerOpenClawTools, executeTool } = await load();
    await registerOpenClawTools('u2');
    const res = await executeTool('u2', 'openclaw__x__read_mentions', {});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/^not_connected/);
    expect(callOpenClawTool).not.toHaveBeenCalled();
    expect(socialUpdateMany).toHaveBeenCalledWith({ where: { userId: 'u2', platform: 'x', status: 'active' }, data: { status: 'expired' } });
  });

  it('an expired token with no refresh token becomes expired without any network call', async () => {
    conn.current = activeRow({ expiresAt: new Date(Date.now() - 1000), refreshTokenEnc: null });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { registerOpenClawTools, executeTool } = await load();
    await registerOpenClawTools('u2');
    const res = await executeTool('u2', 'openclaw__x__read_mentions', {});
    expect(res.error).toMatch(/^not_connected/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(callOpenClawTool).not.toHaveBeenCalled();
  });
});

describe('D6: every write tool is Class C at every autonomy level, even with a delegation', () => {
  for (const level of [0, 1, 2, 3, 4, 5]) {
    it(`autonomy ${level}: all ${WRITES.length} write tools and social_schedule_post queue an approval and never run`, async () => {
      autonomy.level = level;
      const { registerOpenClawTools, executeTool } = await load();
      await registerOpenClawTools('u2');
      for (const w of WRITES) {
        createApproval.mockClear();
        const res = await executeTool('u2', `openclaw__${w}`, { text: 'hi' });
        expect(res.success).toBe(false);
        expect(res.approvalRequired, w).toBeDefined();
        expect(createApproval).toHaveBeenCalledTimes(1);
        expect(createApproval.mock.calls[0][0]).toMatchObject({ kind: 'tool_call', tool: `openclaw__${w}`, userId: 'u2' });
        expect(JSON.stringify(createApproval.mock.calls[0][0].params)).not.toContain('AT-secret-111');
      }
      createApproval.mockClear();
      const sched = await executeTool('u2', 'social_schedule_post', { platform: 'x', text: 'later', send_at: new Date(Date.now() + 3600_000).toISOString() });
      expect(sched.approvalRequired).toBeDefined();
      expect(createApproval.mock.calls[0][0]).toMatchObject({ kind: 'scheduled_post', userId: 'u2' });
      expect(callOpenClawTool).not.toHaveBeenCalled();
    });
  }

  it('a write with no connection says not_connected and does not queue an approval', async () => {
    conn.current = null;
    const { registerOpenClawTools, executeTool } = await load();
    await registerOpenClawTools('u2');
    const res = await executeTool('u2', 'openclaw__x__post', { text: 'hi' });
    expect(res.error).toMatch(/^not_connected/);
    expect(createApproval).not.toHaveBeenCalled();
    expect(callOpenClawTool).not.toHaveBeenCalled();
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ action: 'social_not_connected', status: 'DENIED' }));
  });

  it('social_schedule_post rejects a past time, an over-long text, and a missing X connection', async () => {
    const { executeTool } = await load();
    const past = await executeTool('u2', 'social_schedule_post', { platform: 'x', text: 'a', send_at: new Date(Date.now() - 1000).toISOString() });
    expect(past.error).toMatch(/future/);
    const long = await executeTool('u2', 'social_schedule_post', { platform: 'x', text: 'a'.repeat(281), send_at: new Date(Date.now() + 9e6).toISOString() });
    expect(long.error).toMatch(/280/);
    conn.current = null;
    const none = await executeTool('u2', 'social_schedule_post', { platform: 'x', text: 'a', send_at: new Date(Date.now() + 9e6).toISOString() });
    expect(none.error).toMatch(/^not_connected/);
    expect(createApproval).not.toHaveBeenCalled();
  });
});

describe('executeApprovedTool uses the same credential path', () => {
  const tool = 'openclaw__x__post';
  const def = () => sanitised.find((t) => t.name === 'x__post')!;
  async function approved(userId: string) {
    const mod = await load();
    await mod.registerOpenClawTools(userId);
    const params = { args: { text: 'hello' }, defHash: defHash({ description: def().description, inputSchema: def().inputSchema }) };
    const contentHash = approvalContentHash({ kind: 'tool_call', tool, params });
    const now = Date.now();
    approvalFindFirst.mockResolvedValue({
      id: 'ap1', userId, kind: 'tool_call', tool, params, contentHash, status: 'EXECUTING', executedAt: null,
      decidedAt: new Date(now - 1000), expiresAt: new Date(now + 29_000),
    });
    return { mod, call: { id: 'ap1', tool, params, contentHash, correlationId: 'c' } };
  }

  it('with a connection: runs with the credential option and the stored args only', async () => {
    const { mod, call } = await approved('u2');
    const res = await mod.executeApprovedTool('u2', call);
    expect(res.success).toBe(true);
    const [name, args, opts] = callOpenClawTool.mock.calls[0];
    expect(name).toBe('x__post');
    expect(args).toEqual({ text: 'hello' });
    expect(JSON.parse(opts.credential).access_token).toBe('AT-secret-111');
  });

  it('with no connection: not_connected, no gateway call', async () => {
    conn.current = null;
    const { mod, call } = await approved('u2');
    const res = await mod.executeApprovedTool('u2', call);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/^not_connected/);
    expect(callOpenClawTool).not.toHaveBeenCalled();
  });
});

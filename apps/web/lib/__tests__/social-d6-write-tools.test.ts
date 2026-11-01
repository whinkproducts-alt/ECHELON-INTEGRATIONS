/**
 * D6 (derived, drift-proof): the write tool list is computed from the social upstream's real tool
 * definitions (services/openclaw/upstreams/social/src/tools.ts), not hand-typed. Any new tool that
 * is not a `read_*` tool is treated as a write and must be Class C at every autonomy level, even
 * with a delegation row. A new write tool therefore cannot silently become Class A or B.
 *
 * Real: tool-registry, permission engine, class map (config/tool-classes.json). Mocked at the
 * boundary only: MCP client, db, ledger, approvals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import config from '@/config/tool-classes.json';
import { sanitiseToolDefinition } from '@/lib/tool-definition';
import { encryptKey } from '@/lib/key-encryption';
import { TOOLS, PLATFORMS } from '../../../../services/openclaw/upstreams/social/src/tools';

const all = PLATFORMS.flatMap((p) => TOOLS[p].map((t) => ({ platform: p, tool: t.name, gateway: `${p}__${t.name}`, def: t })));
const isRead = (n: string) => n.startsWith('read_');
const READS = all.filter((t) => isRead(t.tool));
const WRITES = all.filter((t) => !isRead(t.tool));

const listOpenClawTools = vi.fn();
const callOpenClawTool = vi.fn();
const createApproval = vi.fn();
const recordAction = vi.fn();
const recordActionSafe = vi.fn();
const autonomy = { level: 1 };

const advertised = all.map((t) => {
  const c = sanitiseToolDefinition({ description: t.def.description, inputSchema: t.def.inputSchema });
  if (!c.ok) throw new Error(`upstream tool ${t.gateway} rejected by sanitiser: ${JSON.stringify(c)}`);
  return { name: t.gateway, description: c.definition.description, inputSchema: c.definition.inputSchema };
});

async function load() {
  vi.doMock('@/lib/openclaw-client', () => ({ isGatewayConfigured: () => true, listOpenClawTools, callOpenClawTool }));
  vi.doMock('@/lib/db', () => ({
    prisma: {
      userProfile: { findUnique: vi.fn(async () => ({ autonomyLevel: autonomy.level })) },
      delegation: { findFirst: vi.fn(async () => ({ id: 'd1', isActive: true })) }, // a delegation always exists
      socialConnection: {
        findFirst: vi.fn(async () => ({
          id: 'c1', userId: 'u2', platform: 'x', status: 'active', accessTokenEnc: encryptKey('AT-d6'), refreshTokenEnc: null,
          expiresAt: new Date(Date.now() + 3600_000), platformUserId: '42', platformHandle: 'h', scopes: 's', createdAt: new Date(),
        })),
        count: vi.fn(async () => 1),
        updateMany: vi.fn(),
      },
      approvalRequest: { findFirst: vi.fn(), updateMany: vi.fn() },
      scheduledPost: { count: vi.fn(async () => 0) },
    },
  }));
  vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn(), correctMemory: vi.fn(), searchMemory: vi.fn() }));
  vi.doMock('@/lib/ledger', () => ({ recordAction, recordActionSafe, updateActionStatus: vi.fn(), countToolExecutions: vi.fn(async () => 0) }));
  vi.doMock('@/lib/approvals', () => ({ createApproval }));
  vi.doMock('@/lib/logger', () => ({ generateCorrelationId: () => 'cid', logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), security: vi.fn() } }));
  return import('@/lib/tool-registry');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.OPENCLAW_ALLOWED_USER_IDS = 'owner-only';
  process.env.ENCRYPTION_KEY = 'c'.repeat(64);
  autonomy.level = 1;
  listOpenClawTools.mockResolvedValue(advertised);
  callOpenClawTool.mockResolvedValue('{"data":[]}');
  createApproval.mockResolvedValue({ id: 'ap1' });
  recordAction.mockResolvedValue({ id: 'a1' });
  recordActionSafe.mockResolvedValue({ id: 'a1' });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OPENCLAW_ALLOWED_USER_IDS;
});

/** Plausible valid args per tool so the call reaches the permission engine rather than input validation. */
const ARGS = { text: 'hi', in_reply_to_id: '1', recipient_id: '2', target_user_id: '3', post_id: '4', media_id: 'm1', comment_id: 'c1', image_url: 'https://e.test/a.png', video_url: 'https://e.test/a.mp4', caption: 'c' };

describe('D6 write tools derived from the social upstream tool list', () => {
  it('the derivation is not vacuous: the upstream has reads and writes on every platform', () => {
    expect(READS.length).toBeGreaterThanOrEqual(6);
    expect(WRITES.length).toBeGreaterThanOrEqual(9);
    for (const p of PLATFORMS) expect(TOOLS[p].some((t) => !isRead(t.name))).toBe(true);
    // The spec names these write verbs; each must exist in the X tool set.
    for (const verb of ['post', 'reply', 'send_dm', 'follow', 'unfollow', 'delete_post']) expect(TOOLS.x.map((t) => t.name)).toContain(verb);
  });

  it('config: no write tool has a class entry (so each defaults to Class C), and nothing but read_* is ever listed under a social name', () => {
    const cfg = config as unknown as Record<string, { class: string }>;
    for (const w of WRITES) expect(cfg[`openclaw__${w.gateway}`], w.gateway).toBeUndefined();
    const social = Object.entries(cfg).filter(([k]) => /^openclaw__(x|instagram|tiktok)__/.test(k));
    for (const [k, v] of social) {
      expect(isRead(k.split('__')[2]), `${k} is listed in the class map but is not a read tool`).toBe(true);
      expect(v.class, k).toBe('A');
    }
  });

  it('every class-map entry under a social name still exists upstream (a renamed tool cannot leave a stale Class A grant)', () => {
    const cfg = config as unknown as Record<string, unknown>;
    const names = new Set(all.map((t) => `openclaw__${t.gateway}`));
    for (const k of Object.keys(cfg).filter((x) => /^openclaw__(x|instagram|tiktok)__/.test(x))) expect(names.has(k), k).toBe(true);
  });

  for (const level of [0, 1, 2, 3, 4, 5]) {
    it(`autonomy ${level}, delegation present: every derived write queues an approval (Class C) and the gateway is never called`, async () => {
      autonomy.level = level;
      const { registerOpenClawTools, executeTool } = await load();
      await registerOpenClawTools('u2');
      for (const w of WRITES) {
        createApproval.mockClear();
        const res = await executeTool('u2', `openclaw__${w.gateway}`, { ...ARGS });
        // Platforms without a connection answer not_connected (no approval); X has one. Either way nothing may run.
        if (w.platform === 'x') {
          expect(res.success, w.gateway).toBe(false);
          expect(res.approvalRequired, w.gateway).toBeDefined();
          expect(createApproval, w.gateway).toHaveBeenCalledTimes(1);
          expect(createApproval.mock.calls[0][0]).toMatchObject({ kind: 'tool_call', tool: `openclaw__${w.gateway}` });
        } else {
          expect(res.success, w.gateway).toBe(false);
        }
      }
      expect(callOpenClawTool).not.toHaveBeenCalled();
    });
  }

  it('every derived read is Class A in the class map (reads run, writes wait)', () => {
    const cfg = config as unknown as Record<string, { class: string }>;
    for (const r of READS) expect(cfg[`openclaw__${r.gateway}`]?.class, r.gateway).toBe('A');
  });
});

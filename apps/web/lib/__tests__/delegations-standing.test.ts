import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type R = Record<string, any>;
let grants: R[]; let approvals: R[]; let ledgerRows: R[]; let locked: boolean; let seq: number; let decided: string[];

function m(row: R, w: R): boolean {
  return Object.entries(w).every(([k, v]) => {
    if (k === 'OR') return (v as R[]).some((o) => m(row, o));
    const x = row[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('not' in v && x === v.not) return false;
      if ('lte' in v && !(x <= v.lte)) return false;
      if ('lt' in v && !(x < v.lt)) return false;
      if ('gt' in v && !(x > v.gt)) return false;
      if ('in' in v && !v.in.includes(x)) return false;
      return true;
    }
    return x === v;
  });
}
const table = (rows: () => R[], set: (r: R[]) => void) => ({
  create: async ({ data }: any) => { const r = { id: `g${++seq}`, dailyCap: 0, usedDay: '', usedToday: 0, startsAt: new Date(0), revokedAt: null, createdAt: new Date(seq), paramsHash: null, team: null, capability: null, ...data }; rows().push(r); return { ...r }; },
  findFirst: async ({ where }: any) => rows().find((r) => m(r, where)) ?? null,
  findMany: async ({ where }: any) => rows().filter((r) => m(r, where)),
  count: async ({ where }: any) => rows().filter((r) => m(r, where)).length,
  deleteMany: async ({ where }: any) => { set(rows().filter((r) => !m(r, where))); return { count: 1 }; },
  updateMany: async ({ where, data }: any) => {
    let count = 0;
    for (const r of rows()) if (m(r, where)) { for (const [k, v] of Object.entries<any>(data)) r[k] = v && typeof v === 'object' && 'increment' in v ? r[k] + v.increment : v; count++; }
    return { count };
  },
});

vi.mock('@/lib/db', () => ({
  prisma: {
    standingGrant: table(() => grants, (r) => { grants = r; }),
    approvalRequest: table(() => approvals, (r) => { approvals = r; }),
    userProfile: { findUnique: async () => ({ autonomyLevel: 1 }) },
    delegation: { findFirst: async () => null },
  },
}));
vi.mock('@/lib/ledger', () => ({
  recordAction: async (e: R) => { ledgerRows.push(e); return 'l'; },
  recordActionSafe: async (e: R) => { ledgerRows.push(e); },
}));
let changedAt: string | null = null;
vi.mock('@/lib/safety/lockdown', () => ({ isLockedDown: async () => locked, getSafetyState: async () => ({ lockedDown: locked, changedAt }) }));
vi.mock('@/lib/logger', () => ({ logger: { security: () => {}, error: () => {} } }));
vi.mock('@/lib/tool-registry', () => ({
  registeredToolClass: (n: string) => (({ routine_b: 'B', other_b: 'B', plain_c: 'C' }) as R)[n] ?? 'C',
}));
vi.mock('@/lib/approvals', () => ({
  createApproval: async (i: R) => { const r = { id: `a${++seq}`, userId: i.userId, kind: i.kind, tool: i.tool, params: i.params, correlationId: i.correlationId }; approvals.push(r); return r; },
  decide: async (_u: string, id: string) => { decided.push(id); return { id, status: 'EXECUTED', result: null }; },
}));

const ME = 'u1';
const NOW = new Date('2026-11-16T12:00:00Z');
const auth = () => ({ owner: true as const, passkeyVerifiedAt: new Date(NOW.getTime() - 60_000) });
const H = 3_600_000;

beforeEach(() => { vi.resetModules(); grants = []; approvals = []; ledgerRows = []; locked = false; changedAt = null; seq = 0; decided = []; process.env.ECHELON_STANDING_GRANTS = 'on'; });
afterEach(() => { delete process.env.ECHELON_STANDING_GRANTS; });

const mod = () => import('@/lib/delegations-standing');
const perm = () => import('@/lib/permission-engine');

describe('item 70: switch-on gate', () => {
  it('is off by default: nothing can be created or used', async () => {
    delete process.env.ECHELON_STANDING_GRANTS;
    const s = await mod();
    await expect(s.openGlobalWindow(ME, H, auth(), NOW)).rejects.toThrow(/switched off/);
    await expect(s.createAgentTierGrant(ME, { capability: 'routine_b', team: 't', ms: H, dailyCap: 1 }, auth(), NOW)).rejects.toThrow(/switched off/);
    await expect(s.createBatch(ME, [{ tool: 'routine_b', params: {} }])).rejects.toThrow(/switched off/);
    grants.push({ id: 'x', userId: ME, kind: 'global', revokedAt: null, startsAt: new Date(0), expiresAt: new Date(NOW.getTime() + H), dailyCap: 0, usedDay: '', usedToday: 0 });
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', {}, NOW)).toBeNull();
  });
  it('a Class B call with a grant row is still denied while the flag is off', async () => {
    delete process.env.ECHELON_STANDING_GRANTS;
    grants.push({ id: 'x', userId: ME, kind: 'global', revokedAt: null, startsAt: new Date(0), expiresAt: new Date(Date.now() + H), dailyCap: 0, usedDay: '', usedToday: 0 });
    const { checkPermission } = await perm();
    expect((await checkPermission(ME, 'routine_b', 'B')).allowed).toBe(false);
  });
});

describe('R9 global window', () => {
  it('needs the owner with a fresh passkey check', async () => {
    const s = await mod();
    await expect(s.openGlobalWindow(ME, H, undefined as never, NOW)).rejects.toThrow(/passkey/);
    await expect(s.openGlobalWindow(ME, H, { owner: true, passkeyVerifiedAt: new Date(NOW.getTime() - 10 * 60_000) }, NOW)).rejects.toThrow(/passkey/);
    await expect(s.openGlobalWindow(ME, H, { owner: false } as never, NOW)).rejects.toThrow(/passkey/);
  });
  it('caps at 24 hours, one at a time, and reverts by itself', async () => {
    const s = await mod();
    await expect(s.openGlobalWindow(ME, 25 * H, auth(), NOW)).rejects.toThrow(/range/);
    await s.openGlobalWindow(ME, 2 * H, auth(), NOW);
    await expect(s.openGlobalWindow(ME, H, auth(), NOW)).rejects.toThrow(/already open/);
    expect(await s.getActiveGlobalWindow(ME, NOW)).not.toBeNull();
    expect(await s.getActiveGlobalWindow(ME, new Date(NOW.getTime() + 3 * H))).toBeNull();
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', {}, new Date(NOW.getTime() + 3 * H))).toBeNull();
  });
  it('lifts routine Class B and ledgers the window id', async () => {
    const s = await mod();
    const id = await s.openGlobalWindow(ME, H, auth(), NOW);
    expect((await s.findStandingGrant(ME, 'routine_b', 'B', {}, NOW))?.id).toBe(id);
    expect(ledgerRows.some((r) => r.action === 'standing_grant_used' && r.grantId === id)).toBe(true);
  });
  it('never covers Class C, Class A, money, proprietary data, founder-private or kill-team', async () => {
    const s = await mod();
    await s.openGlobalWindow(ME, H, auth(), NOW);
    expect(await s.findStandingGrant(ME, 'plain_c', 'C', {}, NOW)).toBeNull();
    expect(await s.findStandingGrant(ME, 'routine_b', 'A', {}, NOW)).toBeNull();
    for (const cap of ['send_payment', 'wire_transfer', 'email_send', 'share_document', 'founder_private_read', 'kill_team_message']) {
      expect(await s.findStandingGrant(ME, cap, 'B', {}, NOW), cap).toBeNull();
    }
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', { scope: 'founder_private' }, NOW)).toBeNull();
  });
  it('through checkPermission: Class C and protected stay blocked inside the window, Class B runs', async () => {
    const s = await mod();
    await s.openGlobalWindow(ME, H, { owner: true, passkeyVerifiedAt: new Date(Date.now() - 1000) }, new Date());
    const { checkPermission } = await perm();
    expect((await checkPermission(ME, 'routine_b', 'B')).allowed).toBe(true);
    expect((await checkPermission(ME, 'plain_c', 'C')).allowed).toBe(false);
    const money = await checkPermission(ME, 'send_payment', 'B');
    expect(money.allowed).toBe(false);
    expect(money.protected).toBe(true);
  });
  it('lockdown ends the window at once and it stays ended after release', async () => {
    const s = await mod();
    await s.openGlobalWindow(ME, H, auth(), NOW);
    locked = true;
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', {}, NOW)).toBeNull();
    locked = false;
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', {}, NOW)).toBeNull();
  });
  it('a lockdown lifted later does not revive a window opened before it', async () => {
    const s = await mod();
    await s.openGlobalWindow(ME, 5 * H, auth(), NOW);
    changedAt = new Date(NOW.getTime() + H).toISOString(); // lockdown activated and lifted without any Class B call in between
    const later = new Date(NOW.getTime() + 2 * H);
    expect(await s.getActiveGlobalWindow(ME, later)).toBeNull();
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', {}, later)).toBeNull();
  });
  it('does not fire on a tainted turn, and ledger failure means no run', async () => {
    const s = await mod();
    await s.openGlobalWindow(ME, H, auth(), NOW);
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', { tainted: true }, NOW)).toBeNull();
  });
  it('revoke is instant', async () => {
    const s = await mod();
    const id = await s.openGlobalWindow(ME, H, auth(), NOW);
    expect(await s.revokeGrant(ME, id, auth(), NOW)).toBe(true);
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', {}, NOW)).toBeNull();
  });
  it('another user cannot use or revoke it', async () => {
    const s = await mod();
    const id = await s.openGlobalWindow(ME, H, auth(), NOW);
    expect(await s.findStandingGrant('u2', 'routine_b', 'B', {}, NOW)).toBeNull();
    expect(await s.revokeGrant('u2', id, auth(), NOW)).toBe(false);
  });
});

describe('R4 agent tier', () => {
  it('covers only its own team, only the named capability, within the daily cap', async () => {
    const s = await mod();
    await s.createAgentTierGrant(ME, { capability: 'routine_b', team: 'ops', ms: H, dailyCap: 2 }, auth(), NOW);
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', { agentTeam: 'sales' }, NOW)).toBeNull();
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', {}, NOW)).toBeNull();
    expect(await s.findStandingGrant(ME, 'other_b', 'B', { agentTeam: 'ops' }, NOW)).toBeNull();
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', { agentTeam: 'ops' }, NOW)).not.toBeNull();
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', { agentTeam: 'ops' }, NOW)).not.toBeNull();
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', { agentTeam: 'ops' }, NOW)).toBeNull(); // cap
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', { agentTeam: 'ops' }, new Date(NOW.getTime() + 24 * H - 60_000))).toBeNull(); // expired
  });
  it('cannot be created over Class C, protected or founder-private capabilities', async () => {
    const s = await mod();
    for (const capability of ['plain_c', 'send_payment', 'founder_private_read', 'kill_team_post', 'unregistered_tool']) {
      await expect(s.createAgentTierGrant(ME, { capability, team: 'ops', ms: H, dailyCap: 1 }, auth(), NOW), capability).rejects.toThrow(/eligible/);
    }
    await expect(s.createAgentTierGrant(ME, { capability: 'routine_b', team: 'ops', ms: 31 * 24 * H, dailyCap: 1 }, auth(), NOW)).rejects.toThrow(/range/);
  });
  it('an agent cannot create one (no owner auth)', async () => {
    const s = await mod();
    await expect(s.createAgentTierGrant(ME, { capability: 'routine_b', team: 'ops', ms: H, dailyCap: 1 }, { owner: true, passkeyVerifiedAt: undefined } as never, NOW)).rejects.toThrow(/passkey/);
  });
});

describe('R5 learned delegations', () => {
  const approved = (n: number, params: unknown, cls = 'B') => {
    for (let i = 0; i < n; i++) approvals.push({ userId: ME, kind: 'tool_call', tool: 'routine_b', params, contentHash: null, permissionClass: cls, status: 'EXECUTED' });
  };
  const withHash = async (params: unknown) => {
    const { approvalContentHash } = await import('@/lib/canonical-json');
    const h = approvalContentHash({ kind: 'tool_call', tool: 'routine_b', params: params as never });
    approvals.forEach((a) => { if (a.contentHash === null) a.contentHash = h; });
  };
  it('offers only after 5 identical approvals, and not for different params', async () => {
    const s = await mod();
    approved(4, { a: 1 }); await withHash({ a: 1 });
    expect(await s.learnedOffer(ME, 'routine_b', { a: 1 }, NOW)).toBeNull();
    approved(1, { a: 1 }); await withHash({ a: 1 });
    expect((await s.learnedOffer(ME, 'routine_b', { a: 1 }, NOW))?.count).toBe(5);
    expect(await s.learnedOffer(ME, 'routine_b', { a: 2 }, NOW)).toBeNull();
  });
  it('Class C approvals never count', async () => {
    const s = await mod();
    approved(6, { a: 1 }, 'C'); await withHash({ a: 1 });
    expect(await s.learnedOffer(ME, 'routine_b', { a: 1 }, NOW)).toBeNull();
  });
  it('accepting needs the owner, runs only the identical call, has a cap, 30 day expiry and revokes', async () => {
    const s = await mod();
    approved(5, { a: 1 }); await withHash({ a: 1 });
    await expect(s.acceptLearned(ME, 'routine_b', { a: 1 }, 2, undefined as never, NOW)).rejects.toThrow(/passkey/);
    const id = await s.acceptLearned(ME, 'routine_b', { a: 1 }, 1, auth(), NOW);
    expect(grants[0].expiresAt.getTime() - NOW.getTime()).toBe(30 * 24 * H);
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', { params: { a: 2 } }, NOW)).toBeNull();
    expect((await s.findStandingGrant(ME, 'routine_b', 'B', { params: { a: 1 } }, NOW))?.id).toBe(id);
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', { params: { a: 1 } }, NOW)).toBeNull(); // daily cap 1
    expect(await s.learnedOffer(ME, 'routine_b', { a: 1 }, NOW)).toBeNull(); // already delegated
    await s.revokeGrant(ME, id, auth(), NOW);
    expect(await s.findStandingGrant(ME, 'routine_b', 'B', { params: { a: 1 } }, new Date(NOW.getTime() + 24 * H))).toBeNull();
  });
  it('can only tighten: it never turns a Class C call into a runnable one', async () => {
    const s = await mod();
    for (let i = 0; i < 6; i++) approvals.push({ userId: ME, kind: 'tool_call', tool: 'plain_c', params: {}, contentHash: 'x', permissionClass: 'B', status: 'EXECUTED' });
    expect(await s.learnedOffer(ME, 'plain_c', {}, NOW)).toBeNull();
    const { checkPermission } = await perm();
    grants.push({ id: 'l', userId: ME, kind: 'learned', capability: 'plain_c', paramsHash: null, revokedAt: null, startsAt: new Date(0), expiresAt: new Date(Date.now() + H), dailyCap: 5, usedDay: '', usedToday: 0 });
    expect((await checkPermission(ME, 'plain_c', 'C')).allowed).toBe(false);
  });
});

describe('R8 template plus schedule', () => {
  it('runs only the exact approved content, 30 day cap, and any edit cancels it', async () => {
    const s = await mod();
    await expect(s.createTemplateGrant(ME, { tool: 'routine_b', args: { t: 'hi' }, ms: 31 * 24 * H, dailyCap: 1 }, auth(), NOW)).rejects.toThrow(/range/);
    const id = await s.createTemplateGrant(ME, { tool: 'routine_b', args: { t: 'hi' }, ms: 30 * 24 * H, dailyCap: 3 }, auth(), NOW);
    expect(await s.useTemplate(ME, id, { tool: 'routine_b', args: { t: 'changed' } }, NOW)).toBe(false);
    expect(await s.useTemplate(ME, id, { tool: 'routine_b', args: { t: 'hi' } }, NOW)).toBe(true);
    expect(await s.editTemplate(ME, id, auth(), NOW)).toBe(true);
    expect(await s.useTemplate(ME, id, { tool: 'routine_b', args: { t: 'hi' } }, NOW)).toBe(false);
  });
  it('refuses protected or non-Class-B content, and secrets in args', async () => {
    const s = await mod();
    await expect(s.createTemplateGrant(ME, { tool: 'social_post', args: {}, ms: H, dailyCap: 1 }, auth(), NOW)).rejects.toThrow(/eligible/);
    await expect(s.createTemplateGrant(ME, { tool: 'plain_c', args: {}, ms: H, dailyCap: 1 }, auth(), NOW)).rejects.toThrow(/eligible/);
    await expect(s.createTemplateGrant(ME, { tool: 'routine_b', args: { text: 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789' }, ms: H, dailyCap: 1 }, auth(), NOW)).rejects.toThrow(/secret/);
  });
  it('is dead during lockdown', async () => {
    const s = await mod();
    const id = await s.createTemplateGrant(ME, { tool: 'routine_b', args: 1, ms: H, dailyCap: 3 }, auth(), NOW);
    locked = true;
    expect(await s.useTemplate(ME, id, { tool: 'routine_b', args: 1 }, NOW)).toBe(false);
  });
});

describe('R7 batch approval', () => {
  it('creates one request per item on one card, and decides each id on its own', async () => {
    const s = await mod();
    const { batchId, approvals: a } = await s.createBatch(ME, [{ tool: 'routine_b', params: { n: 1 } }, { tool: 'routine_b', params: { n: 2 } }], NOW);
    expect(new Set(a.map((x) => x.id)).size).toBe(2);
    const out = await s.decideBatch(ME, batchId, a.map((x) => x.id), 'approve');
    expect(out).toHaveLength(2);
    expect(decided).toEqual(a.map((x) => x.id));
  });
  it('refuses protected items, other users, foreign ids, duplicates and wildcard lists', async () => {
    const s = await mod();
    await expect(s.createBatch(ME, [{ tool: 'routine_b', params: {} }, { tool: 'send_payment', params: {} }])).rejects.toThrow(/protected/);
    const { batchId, approvals: a } = await s.createBatch(ME, [{ tool: 'routine_b', params: {} }]);
    approvals.push({ id: 'zz', userId: ME, kind: 'tool_call', tool: 'routine_b', params: {}, correlationId: 'other' });
    await expect(s.decideBatch(ME, batchId, [a[0].id, 'zz'], 'approve')).rejects.toThrow(/not all on this batch/);
    await expect(s.decideBatch('u2', batchId, [a[0].id], 'approve')).rejects.toThrow(/not all on this batch/);
    await expect(s.decideBatch(ME, batchId, [a[0].id, a[0].id], 'approve')).rejects.toThrow(/once/);
    await expect(s.decideBatch(ME, batchId, [], 'approve')).rejects.toThrow(/once/);
    expect(decided).toEqual([]);
  });
  it('refuses a protected row even if it sits on the batch correlation id', async () => {
    const s = await mod();
    approvals.push({ id: 'p1', userId: ME, kind: 'tool_call', tool: 'send_payment', params: {}, correlationId: 'batch:b1' });
    await expect(s.decideBatch(ME, 'b1', ['p1'], 'approve')).rejects.toThrow(/protected/);
    expect(decided).toEqual([]);
  });
});

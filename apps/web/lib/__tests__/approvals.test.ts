import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { approvalContentHash, canonicalJson } from '../canonical-json';

interface Row {
  id: string; userId: string; kind: string; tool: string | null; params: unknown; contentHash: string;
  summary: string; permissionClass: string; status: string; correlationId: string; conversationId: string | null;
  persona: string; createdAt: Date; expiresAt: Date; decidedAt: Date | null; executedAt: Date | null; result: unknown;
}
type Where = { id?: string; userId?: string; status?: string; executedAt?: null; expiresAt?: { gt?: Date; lte?: Date }; decidedAt?: { lt?: Date } };

function matches(r: Row, w: Where): boolean {
  if (w.id !== undefined && r.id !== w.id) return false;
  if (w.userId !== undefined && r.userId !== w.userId) return false;
  if (w.status !== undefined && r.status !== w.status) return false;
  if (w.expiresAt?.gt && !(r.expiresAt.getTime() > w.expiresAt.gt.getTime())) return false;
  if (w.expiresAt?.lte && !(r.expiresAt.getTime() <= w.expiresAt.lte.getTime())) return false;
  if (w.executedAt === null && r.executedAt !== null) return false;
  if (w.decidedAt?.lt && !(r.decidedAt && r.decidedAt.getTime() < w.decidedAt.lt.getTime())) return false;
  return true;
}

const T0 = new Date('2026-10-03T12:00:00.000Z');
const at = (ms: number) => () => new Date(T0.getTime() + ms);
const TOOL = 'openclaw__itest__post';

describe('approvals', () => {
  let rows: Row[];
  let ledgerRows: Array<Record<string, any>>;
  let handler: ReturnType<typeof vi.fn>;
  let autonomy: number;
  let delegation: boolean;
  let seq: number;
  let failLedger: Set<string>;

  async function setup(opts: { permissionEngine?: 'real' | 'refuse' } = {}) {
    vi.resetModules();
    process.env.OPENCLAW_ALLOWED_USER_IDS = 'u1';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    rows = []; ledgerRows = []; failLedger = new Set(); seq = 0; autonomy = 1; delegation = false;
    handler = vi.fn().mockResolvedValue({ posted: true });
    const approvalRequest = {
      create: async ({ data }: { data: Partial<Row> }) => {
        const r = { decidedAt: null, executedAt: null, result: null, params: null, ...data, id: `ap${++seq}` } as Row;
        rows.push(r); return { ...r };
      },
      findFirst: async ({ where }: { where: Where }) => { await Promise.resolve(); const r = rows.find((x) => matches(x, where)); return r ? { ...r } : null; },
      findMany: async ({ where }: { where: Where }) => rows.filter((x) => matches(x, where)).map((x) => ({ ...x })),
      updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
        await Promise.resolve();
        let count = 0;
        for (const r of rows) if (matches(r, where)) { Object.assign(r, data); count++; }
        return { count };
      },
      deleteMany: async ({ where }: { where: Where }) => { rows = rows.filter((r) => !matches(r, where)); return { count: 1 }; },
    };
    vi.doMock('@/lib/db', () => ({
      prisma: {
        approvalRequest,
        conversation: { findFirst: async ({ where }: { where: { id: string; userId: string } }) => (where.userId === 'u1' && where.id === 'c1' ? { id: 'c1' } : null) },
        userProfile: { findUnique: async () => ({ autonomyLevel: autonomy }) },
        delegation: { findFirst: async () => (delegation ? { id: 'd1' } : null) },
      },
    }));
    vi.doMock('@/lib/ledger', () => ({
      recordAction: async (e: Record<string, any>) => {
        if (failLedger.has(e.action)) throw new Error('ledger down');
        ledgerRows.push(e); return { id: `l${ledgerRows.length}` };
      },
      recordActionSafe: async (e: Record<string, any>) => { ledgerRows.push(e); return { id: `l${ledgerRows.length}` }; },
      updateActionStatus: async () => true,
    }));
    vi.doMock('@/lib/openclaw-client', () => ({
      isGatewayConfigured: () => true,
      listOpenClawTools: async () => [{ name: 'itest__post', description: 'd', inputSchema: {} }],
      callOpenClawTool: handler,
    }));
    vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn(), correctMemory: vi.fn(), searchMemory: vi.fn() }));
    vi.doUnmock('@/lib/permission-engine');
    if (opts.permissionEngine === 'refuse') {
      vi.doMock('@/lib/permission-engine', () => ({
        checkPermission: async () => ({ allowed: false, method: 'requires_confirmation', reason: 'Class C' }),
        checkApprovedAction: vi.fn().mockResolvedValue({ allowed: false, method: 'requires_confirmation', reason: 'engine refused' }),
        logSecurityEvent: vi.fn(),
      }));
    }
    const registry = await import('../tool-registry');
    await registry.registerOpenClawTools('u1');
    const approvals = await import('../approvals');
    return { registry, approvals };
  }

  async function queue(registry: Awaited<ReturnType<typeof setup>>['registry'], params: Record<string, unknown> = { text: 'hello' }) {
    const res = await registry.executeTool('u1', TOOL, params, 'WHINK', undefined, 'cid-1');
    expect(res.approvalRequired).toBeDefined();
    return res.approvalRequired!;
  }

  const rowsFor = (action: string) => ledgerRows.filter((l) => l.action === action);

  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.useRealTimers(); });

  it('B1: stores full params, 30 s expiry, sha256 of canonical {kind,tool,params}, AWAITING_APPROVAL ledger row', async () => {
    const { registry } = await setup();
    const big = { text: 'x'.repeat(2000), b: 1, a: { z: 1, y: 2 } };
    const a = await queue(registry, big);
    expect(a.params).toEqual({ args: big, defHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(a.tool).toBe(TOOL);
    expect(a.kind).toBe('tool_call');
    expect(a.permissionClass).toBe('C');
    expect(new Date(a.expiresAt).getTime() - new Date(a.createdAt).getTime()).toBe(30_000);
    expect(a.contentHash).toBe(approvalContentHash({ kind: 'tool_call', tool: TOOL, params: a.params }));
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    const created = rowsFor('approval_created');
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe('AWAITING_APPROVAL');
    expect(created[0].validationResult).toContain(a.id);
    expect(handler).not.toHaveBeenCalled();
  });

  it('B1: createApproval rejects a conversation the user does not own', async () => {
    const { approvals } = await setup();
    await expect(approvals.createApproval({ userId: 'u2', kind: 'ear', params: {}, correlationId: 'c', conversationId: 'c1' })).rejects.toThrow();
    const ok = await approvals.createApproval({ userId: 'u1', kind: 'ear', params: { objective: 'o' }, correlationId: 'c', conversationId: 'c1' });
    expect(ok.kind).toBe('ear');
    expect(ok.tool).toBeNull();
  });

  it('approve runs stored params once and records executed result', async () => {
    const { registry, approvals } = await setup();
    const a = await queue(registry, { text: 'hi' });
    const out = await approvals.decide('u1', a.id, 'approve', { now: at(1000) });
    expect(out.status).toBe('EXECUTED');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.any(String), { text: 'hi' });
    expect(rows[0].status).toBe('EXECUTED');
  });

  it('legacy EAR cannot report dispatched without an executable approved scope', async () => {
    const { approvals } = await setup();
    const ear = { objective: 'Ship it', lead_agent: 'A', supporting_agents: [], team_size: 1, capability_gaps: [] };
    const a = await approvals.createApproval({ userId: 'u1', kind: 'ear', params: ear, correlationId: 'c', now: () => T0 });
    const out = await approvals.decide('u1', a.id, 'approve', { now: at(5000) });
    expect(out.status).toBe('FAILED');
    expect(String(out.result?.data)).not.toContain('TEAM DISPATCHED');
  });

  it('B3: permission engine refusal means an approved request does not run', async () => {
    const { registry, approvals } = await setup({ permissionEngine: 'refuse' });
    const a = await queue(registry);
    const out = await approvals.decide('u1', a.id, 'approve', { now: at(1000) });
    expect(out.status).toBe('FAILED');
    expect(handler).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('FAILED');
  });

  it('B3: real engine only allows an EXECUTING approval with matching capability and hash', async () => {
    const { registry } = await setup();
    const { checkApprovedAction } = await import('../permission-engine');
    const a = await queue(registry);
    expect((await checkApprovedAction('u1', a.id, TOOL, a.contentHash)).allowed).toBe(false); // still PENDING
    rows[0].status = 'EXECUTING'; rows[0].decidedAt = T0;
    expect((await checkApprovedAction('u1', a.id, TOOL, a.contentHash)).allowed).toBe(true);
    expect((await checkApprovedAction('u1', a.id, 'other_tool', a.contentHash)).allowed).toBe(false);
    expect((await checkApprovedAction('u1', a.id, TOOL, 'bad')).allowed).toBe(false);
    expect((await checkApprovedAction('u2', a.id, TOOL, a.contentHash)).allowed).toBe(false);
    rows[0].decidedAt = new Date(T0.getTime() + 31_000);
    expect((await checkApprovedAction('u1', a.id, TOOL, a.contentHash)).allowed).toBe(false);
  });

  it('B4: 29.9 s runs; 30.1 s is EXPIRED, handler not called, expiry ledgered', async () => {
    const early = await setup();
    const a1 = await early.registry.executeTool('u1', TOOL, { t: 1 }, 'WHINK', undefined, 'c');
    rows[0].createdAt = T0; rows[0].expiresAt = new Date(T0.getTime() + 30_000);
    const ok = await early.approvals.decide('u1', a1.approvalRequired!.id, 'approve', { now: at(29_900) });
    expect(ok.status).toBe('EXECUTED');
    expect(handler).toHaveBeenCalledTimes(1);

    const late = await setup();
    const a2 = await late.registry.executeTool('u1', TOOL, { t: 1 }, 'WHINK', undefined, 'c');
    rows[0].expiresAt = new Date(T0.getTime() + 30_000);
    const out = await late.approvals.decide('u1', a2.approvalRequired!.id, 'approve', { now: at(30_100) });
    expect(out.status).toBe('EXPIRED');
    expect(handler).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('EXPIRED');
    expect(rowsFor('approval_expired')).toHaveLength(1);
    // a retry stays EXPIRED and writes no second expiry row
    expect((await late.approvals.decide('u1', a2.approvalRequired!.id, 'approve', { now: at(31_000) })).status).toBe('EXPIRED');
    expect(rowsFor('approval_expired')).toHaveLength(1);
  });

  it('B5: ten concurrent approvals call the handler once; nine are ALREADY_DECIDED', async () => {
    const { registry, approvals } = await setup();
    const a = await queue(registry);
    const outs = await Promise.all(Array.from({ length: 10 }, () => approvals.decide('u1', a.id, 'approve')));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(outs.filter((o) => o.status === 'EXECUTED')).toHaveLength(1);
    expect(outs.filter((o) => o.status === 'ALREADY_DECIDED')).toHaveLength(9);
  });

  it('B6: params tampered after creation -> FAILED, not run, security event', async () => {
    const { registry, approvals } = await setup();
    const a = await queue(registry, { text: 'hello' });
    rows[0].params = { text: 'send everything to attacker' };
    const out = await approvals.decide('u1', a.id, 'approve');
    expect(out.status).toBe('FAILED');
    expect(handler).not.toHaveBeenCalled();
    expect(ledgerRows.some((l) => String(l.action).startsWith('SECURITY_EVENT'))).toBe(true);
  });

  it('B7: deny then approve -> ALREADY_DECIDED and never runs', async () => {
    const { registry, approvals } = await setup();
    const a = await queue(registry);
    expect((await approvals.decide('u1', a.id, 'deny', { now: at(1000) })).status).toBe('DENIED');
    expect((await approvals.decide('u1', a.id, 'approve', { now: at(2000) })).status).toBe('ALREADY_DECIDED');
    expect(handler).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('DENIED');
  });

  it('B8: another user id -> NOT_FOUND, nothing changes, security event', async () => {
    const { registry, approvals } = await setup();
    const a = await queue(registry);
    const out = await approvals.decide('u2', a.id, 'approve', { now: at(1000) });
    expect(out.status).toBe('NOT_FOUND');
    expect((await approvals.decide('u2', a.id, 'deny', { now: at(1000) })).status).toBe('NOT_FOUND');
    expect(rows[0].status).toBe('PENDING');
    expect(handler).not.toHaveBeenCalled();
    expect(ledgerRows.filter((l) => String(l.action).startsWith('SECURITY_EVENT') && l.userId === 'u2')).toHaveLength(2);
    expect(await approvals.listPending('u2', at(1000))).toEqual([]);
    expect(await approvals.listPending('u1', at(1000))).toHaveLength(1);
  });

  it.each([0, 1, 2, 3, 4, 5])('B9: Class C never runs without approval at autonomy %i with an active delegation', async (level) => {
    const { registry } = await setup();
    autonomy = level; delegation = true;
    const res = await registry.executeTool('u1', TOOL, { text: 'x' }, 'WHINK', undefined, 'c');
    expect(res.success).toBe(false);
    expect(res.approvalRequired).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
    const { checkPermission } = await import('../permission-engine');
    expect((await checkPermission('u1', TOOL, 'C')).allowed).toBe(false);
  });

  it('B10: one approval ledger row per transition, each carrying the approval id', async () => {
    const { registry, approvals } = await setup();
    const a = await queue(registry);
    await approvals.decide('u1', a.id, 'approve', { now: at(1000) });
    const approvalRows = ledgerRows.filter((l) => String(l.action).startsWith('approval_'));
    expect(approvalRows.map((l) => l.action)).toEqual(['approval_created', 'approval_approved', 'approval_executed']);
    for (const l of approvalRows) expect(l.validationResult).toContain(a.id);

    const b = await queue(registry, { text: 'deny me' });
    await approvals.decide('u1', b.id, 'deny', { now: at(1000) });
    expect(rowsFor('approval_denied')).toHaveLength(1);
    expect(rowsFor('approval_denied')[0].validationResult).toContain(b.id);
  });

  it('M2: the handler runs only for the caller that consumes executedAt; a replay is denied and ledgered', async () => {
    const { registry, approvals } = await setup();
    const a = await queue(registry, { text: 'once' });
    await approvals.decide('u1', a.id, 'approve', { now: at(1000) });
    expect(handler).toHaveBeenCalledTimes(1);
    // Replay the execution path against the same (now terminal) row.
    const stored = rows[0];
    const replay = await registry.executeApprovedTool('u1', { id: a.id, tool: TOOL, params: stored.params, contentHash: stored.contentHash, correlationId: 'cid-1' });
    expect(replay.success).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    // Even if the row is forced back to EXECUTING, a consumed approval cannot run again.
    stored.status = 'EXECUTING';
    const replay2 = await registry.executeApprovedTool('u1', { id: a.id, tool: TOOL, params: stored.params, contentHash: stored.contentHash, correlationId: 'cid-1' });
    expect(replay2.success).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(ledgerRows.some((l) => l.action === 'tool_execution_denied' && l.status === 'DENIED')).toBe(true);
  });

  it('M2: losing the executedAt claim denies and does not run the handler', async () => {
    const { registry } = await setup();
    const a = await queue(registry, { text: 'race' });
    const r = rows[0];
    r.status = 'EXECUTING'; r.decidedAt = T0;
    const [x, y] = await Promise.all([
      registry.executeApprovedTool('u1', { id: a.id, tool: TOOL, params: r.params, contentHash: r.contentHash, correlationId: 'c' }),
      registry.executeApprovedTool('u1', { id: a.id, tool: TOOL, params: r.params, contentHash: r.contentHash, correlationId: 'c' }),
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect([x.success, y.success].filter(Boolean)).toHaveLength(1);
  });

  it('sweep: expires stale PENDING rows with one approval_expired ledger row each, scoped by user', async () => {
    const { registry, approvals } = await setup();
    const a = await queue(registry, { text: 'a' });
    await queue(registry, { text: 'b' });
    rows.push({ ...rows[0], id: 'other', userId: 'u2' });
    const out = await approvals.sweepApprovals(at(31_000)(), 'u1');
    expect(out).toEqual({ expired: 2, stuckFailed: 0 });
    expect(rows.filter((r) => r.userId === 'u1').every((r) => r.status === 'EXPIRED')).toBe(true);
    expect(rows.find((r) => r.id === 'other')?.status).toBe('PENDING');
    expect(rowsFor('approval_expired')).toHaveLength(2);
    expect(rowsFor('approval_expired')[0].validationResult).toContain(a.id);
    expect(await approvals.sweepApprovals(at(32_000)(), 'u1')).toEqual({ expired: 0, stuckFailed: 0 });
    expect(rowsFor('approval_expired')).toHaveLength(2);
  });

  it('sweep: EXECUTING older than 2 minutes becomes FAILED with approval_stuck_failed and is never re-run', async () => {
    const { registry, approvals } = await setup();
    await queue(registry, { text: 'stuck' });
    rows[0].status = 'EXECUTING'; rows[0].decidedAt = T0;
    expect(await approvals.sweepApprovals(at(119_000)(), 'u1')).toEqual({ expired: 0, stuckFailed: 0 });
    expect(await approvals.sweepApprovals(at(121_000)(), 'u1')).toEqual({ expired: 0, stuckFailed: 1 });
    expect(rows[0].status).toBe('FAILED');
    expect(rowsFor('approval_stuck_failed')).toHaveLength(1);
    expect(handler).not.toHaveBeenCalled();
    const out = await approvals.decide('u1', rows[0].id, 'approve', { now: at(122_000) });
    expect(out.status).toBe('ALREADY_DECIDED');
    expect(handler).not.toHaveBeenCalled();
  });

  it('sweep runs from listPending and decide', async () => {
    const { registry, approvals } = await setup();
    await queue(registry, { text: 'a' });
    expect(await approvals.listPending('u1', at(31_000))).toEqual([]);
    expect(rows[0].status).toBe('EXPIRED');
    expect(rowsFor('approval_expired')).toHaveLength(1);
    const b = await queue(registry, { text: 'b' });
    const out = await approvals.decide('u1', b.id, 'approve', { now: at(100_000) });
    expect(out.status).toBe('EXPIRED');
    expect(rowsFor('approval_expired')).toHaveLength(2);
    expect(handler).not.toHaveBeenCalled();
  });

  it('L4: if approval_approved cannot be ledgered the row is FAILED and nothing runs', async () => {
    const { registry, approvals } = await setup();
    const a = await queue(registry, { text: 'x' });
    failLedger.add('approval_approved');
    const out = await approvals.decide('u1', a.id, 'approve', { now: at(1000) });
    expect(out.status).toBe('FAILED');
    expect(rows[0].status).toBe('FAILED');
    expect(handler).not.toHaveBeenCalled();
    expect(rowsFor('approval_executed')).toHaveLength(0);
  });

  it('L3-adjacent: a malformed stored payload fails the hash lock instead of throwing', async () => {
    const { registry, approvals } = await setup();
    const a = await queue(registry, { text: 'x' });
    rows[0].params = { text: new Date() };
    const out = await approvals.decide('u1', a.id, 'approve', { now: at(1000) });
    expect(out.status).toBe('FAILED');
    expect(handler).not.toHaveBeenCalled();
  });

  it('L7: with an approval already pending this turn, a Class C call is denied and ledgered, not queued', async () => {
    const { registry } = await setup();
    const res = await registry.executeTool('u1', TOOL, { text: 'second' }, 'WHINK', undefined, 'cid-2', { approvalAlreadyPending: true });
    expect(res.approvalRequired).toBeUndefined();
    expect(res.success).toBe(false);
    expect(rows).toHaveLength(0);
    expect(rowsFor('approval_already_pending_this_turn')).toHaveLength(1);
    expect(rowsFor('approval_already_pending_this_turn')[0].status).toBe('DENIED');
    expect(handler).not.toHaveBeenCalled();
  });
});

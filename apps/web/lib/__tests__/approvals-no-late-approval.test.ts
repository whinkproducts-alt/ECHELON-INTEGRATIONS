/**
 * An expired approval request is never revived and never runs. A late action is a NEW request the
 * owner approves again (docs/decisions.md, 2026-10-28). Replaces the former "council" tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface Row {
  id: string; userId: string; kind: string; tool: string | null; params: unknown; contentHash: string;
  summary: string; permissionClass: string; status: string; correlationId: string; conversationId: string | null;
  persona: string; createdAt: Date; expiresAt: Date; decidedAt: Date | null; executedAt: Date | null; result: unknown;
}
type Where = { id?: string; userId?: string; status?: string; expiresAt?: { gt?: Date; lte?: Date }; decidedAt?: { lt?: Date } };

function matches(r: Row, w: Where): boolean {
  if (w.id !== undefined && r.id !== w.id) return false;
  if (w.userId !== undefined && r.userId !== w.userId) return false;
  if (w.status !== undefined && r.status !== w.status) return false;
  if (w.expiresAt?.gt && !(r.expiresAt.getTime() > w.expiresAt.gt.getTime())) return false;
  if (w.expiresAt?.lte && !(r.expiresAt.getTime() <= w.expiresAt.lte.getTime())) return false;
  if (w.decidedAt?.lt && !(r.decidedAt && r.decidedAt.getTime() < w.decidedAt.lt.getTime())) return false;
  return true;
}

const T0 = new Date('2026-10-28T12:00:00.000Z');
const at = (ms: number) => () => new Date(T0.getTime() + ms);
const FORMER_COUNCIL_TOOLS = ['document_search', 'memory_read', 'calendar_list', 'connector_health', 'usage_read'];

describe('approvals: no late approval, no revival', () => {
  let rows: Row[];
  let ledgerRows: Array<Record<string, any>>;
  let execute: ReturnType<typeof vi.fn>;
  let seq: number;

  async function setup() {
    vi.resetModules();
    rows = []; ledgerRows = []; seq = 0;
    execute = vi.fn().mockResolvedValue({ success: true, data: 'ran' });
    vi.doMock('@/lib/db', () => ({
      prisma: {
        approvalRequest: {
          create: async ({ data }: { data: Partial<Row> }) => {
            const r = { decidedAt: null, executedAt: null, result: null, params: null, ...data, id: `ap${++seq}` } as Row;
            rows.push(r); return { ...r };
          },
          findFirst: async ({ where }: { where: Where }) => { const r = rows.find((x) => matches(x, where)); return r ? { ...r } : null; },
          findMany: async ({ where }: { where: Where }) => rows.filter((x) => matches(x, where)).map((x) => ({ ...x })),
          updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
            let count = 0;
            for (const r of rows) if (matches(r, where)) { Object.assign(r, data); count++; }
            return { count };
          },
          deleteMany: async () => ({ count: 0 }),
        },
        conversation: { findFirst: async () => null },
        userProfile: { findUnique: async () => ({ autonomyLevel: 4 }), updateMany: async () => ({ count: 0 }) },
        delegation: { findFirst: async () => ({ id: 'd1' }) },
      },
    }));
    vi.doMock('@/lib/ledger', () => ({
      recordAction: async (e: Record<string, any>) => { ledgerRows.push(e); return { id: `l${ledgerRows.length}` }; },
      recordActionSafe: async (e: Record<string, any>) => { ledgerRows.push(e); return { id: `l${ledgerRows.length}` }; },
    }));
    vi.doMock('@/lib/tool-registry', () => ({ executeApprovedTool: execute }));
    vi.doUnmock('@/lib/permission-engine');
    return import('../approvals');
  }

  const mk = (approvals: Awaited<ReturnType<typeof setup>>, tool: string, userId = 'u1') =>
    approvals.createApproval({ userId, kind: 'tool_call', tool, params: { q: 'x' }, correlationId: 'cid', now: () => T0 });

  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.useRealTimers(); });

  for (const tool of FORMER_COUNCIL_TOOLS) {
    it(`expired ${tool} request never runs: sweep, decide and list only mark it EXPIRED`, async () => {
      const approvals = await setup();
      const a = await mk(approvals, tool);
      const pending = await approvals.listPending('u1', at(31_000));
      expect(pending).toHaveLength(0);
      expect(rows[0].status).toBe('EXPIRED');
      expect(new Date(rows[0].expiresAt).getTime()).toBe(T0.getTime() + 30_000); // never pushed forward
      const out = await approvals.decide('u1', a.id, 'approve', { now: at(32_000) });
      expect(out.status).toBe('EXPIRED');
      expect(execute).not.toHaveBeenCalled();
      expect(ledgerRows.filter((l) => l.action === 'approval_expired')).toHaveLength(1);
    });
  }

  it('listPending three days later does not run or revive anything', async () => {
    const approvals = await setup();
    await mk(approvals, 'memory_read');
    const threeDays = 3 * 24 * 3600 * 1000;
    expect(await approvals.listPending('u1', at(threeDays))).toEqual([]);
    expect(await approvals.sweepApprovals(at(threeDays)(), 'u1')).toEqual({ expired: 0, stuckFailed: 0 });
    expect(execute).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('EXPIRED');
    expect(rows[0].executedAt).toBeNull();
  });

  it('sweep writes exactly one approval_expired ledger row per request, with nothing else', async () => {
    const approvals = await setup();
    await mk(approvals, 'document_search'); await mk(approvals, 'usage_read');
    const res = await approvals.sweepApprovals(at(60_000)(), 'u1');
    expect(res.expired).toBe(2);
    const sweepRows = ledgerRows.filter((l) => l.action !== 'approval_created');
    expect(sweepRows.map((l) => l.action)).toEqual(['approval_expired', 'approval_expired']);
  });

  it('deny at 31 s does not run the tool and reports EXPIRED', async () => {
    const approvals = await setup();
    const a = await mk(approvals, 'calendar_list');
    const out = await approvals.decide('u1', a.id, 'deny', { now: at(31_000) });
    expect(out.status).toBe('EXPIRED');
    expect(execute).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('EXPIRED');
    expect(ledgerRows.some((l) => l.action === 'approval_denied')).toBe(false);
  });

  it('approving at 29.9 s runs once; at 30.1 s it does not run', async () => {
    const approvals = await setup();
    const a = await mk(approvals, 'memory_read');
    expect((await approvals.decide('u1', a.id, 'approve', { now: at(29_900) })).status).toBe('EXECUTED');
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await approvals.decide('u1', a.id, 'approve', { now: at(29_950) })).status).toBe('ALREADY_DECIDED');
    expect(execute).toHaveBeenCalledTimes(1);

    const late = await setup();
    const b = await mk(late, 'memory_read');
    expect((await late.decide('u1', b.id, 'approve', { now: at(30_100) })).status).toBe('EXPIRED');
    expect(execute).not.toHaveBeenCalled();
  });

  it('decide has no council option: passing one changes nothing', async () => {
    const approvals = await setup();
    const a = await mk(approvals, 'memory_read');
    const out = await approvals.decide('u1', a.id, 'approve', { now: at(31_000), council: true } as any);
    expect(out.status).toBe('EXPIRED');
    expect(execute).not.toHaveBeenCalled();
    const src = readFileSync(join(__dirname, '..', 'approvals.ts'), 'utf8');
    expect(src).not.toMatch(/council/i);
    expect(existsSync(join(__dirname, '..', 'approval-council.ts'))).toBe(false);
  });

  it('no persona or system initiator can approve: only the owning user id can decide', async () => {
    const approvals = await setup();
    const a = await mk(approvals, 'memory_read');
    for (const who of ['MAMBA', 'WHINK', 'system', 'council', 'u2']) {
      const out = await approvals.decide(who, a.id, 'approve', { now: at(1000) });
      expect(out.status).toBe('NOT_FOUND');
    }
    expect(execute).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('PENDING');
    // decide() takes no persona or initiator input at all
    expect(approvals.decide.length).toBeLessThanOrEqual(4);
  });

  it('no ledger row ever carries a council or consensus action or confirmation method', async () => {
    const approvals = await setup();
    const a = await mk(approvals, 'memory_read');
    await approvals.decide('u1', a.id, 'approve', { now: at(1000) });
    const b = await mk(approvals, 'usage_read');
    await approvals.decide('u1', b.id, 'approve', { now: at(40_000) });
    await approvals.sweepApprovals(at(10 * 24 * 3600 * 1000)(), 'u1');
    expect(ledgerRows.length).toBeGreaterThan(0);
    for (const l of ledgerRows) {
      expect(JSON.stringify(l)).not.toMatch(/council|consensus/i);
      if (l.confirmationMethod) expect(['user_confirmed', 'user_denied']).toContain(l.confirmationMethod);
    }
  });
});

describe('protected-action check stays in the approval path', () => {
  async function engine() {
    vi.resetModules();
    const rec = vi.fn().mockResolvedValue({ id: 'a' });
    vi.doMock('@/lib/db', () => ({
      prisma: {
        userProfile: { findUnique: vi.fn().mockResolvedValue({ autonomyLevel: 4 }) },
        delegation: { findFirst: vi.fn().mockResolvedValue({ id: 'd1' }) },
        approvalRequest: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    }));
    vi.doMock('@/lib/ledger', () => ({ recordAction: rec, recordActionSafe: rec }));
    vi.doUnmock('@/lib/permission-engine');
    return import('@/lib/permission-engine');
  }

  it.each(['contact_message', 'stripe_refund', 'openclaw__x__post', 'sms_briefing_send'])(
    '%s asked as Class A or B with full autonomy and a delegation is still refused as protected',
    async (tool) => {
      const { checkPermission } = await engine();
      for (const cls of ['A', 'B'] as const) {
        const r = await checkPermission('u1', tool, cls, 'cid');
        expect(r.allowed).toBe(false);
        expect(r.protected).toBe(true);
      }
    },
  );

  it('an approval view for a protected tool is flagged protected with its category, and its ledger rows carry it', async () => {
    vi.resetModules();
    const ledgerRows: Array<Record<string, any>> = [];
    vi.doMock('@/lib/db', () => ({
      prisma: { approvalRequest: { create: async ({ data }: any) => ({ ...data, id: 'ap1', decidedAt: null, executedAt: null }) }, conversation: { findFirst: async () => null } },
    }));
    vi.doMock('@/lib/ledger', () => ({
      recordAction: async (e: any) => { ledgerRows.push(e); return { id: 'l' }; },
      recordActionSafe: async (e: any) => { ledgerRows.push(e); return { id: 'l' }; },
    }));
    const { createApproval } = await import('../approvals');
    const v = await createApproval({ userId: 'u1', kind: 'tool_call', tool: 'stripe_refund', params: { amount: 5 }, correlationId: 'c', now: () => T0 });
    expect(v.protected).toBe(true);
    expect(v.category).toBe('money');
    expect(ledgerRows[0].protectedCategory).toBe('money');
  });
});

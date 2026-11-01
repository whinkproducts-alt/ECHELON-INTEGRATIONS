import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
}));

interface Row {
  id: string; userId: string; kind: string; tool: string | null; params: unknown; contentHash: string;
  summary: string; permissionClass: string; status: string; correlationId: string; conversationId: string | null;
  persona: string; createdAt: Date; expiresAt: Date; decidedAt: Date | null; executedAt: Date | null; result: unknown;
}
interface Where {
  id?: string; userId?: string; status?: string; kind?: string;
  expiresAt?: { gt?: Date; lte?: Date }; decidedAt?: { lt?: Date };
}
interface Profile { userId: string; autonomyLevel: number; displayName?: string | null; timezone?: string }

function matches(r: Row, w: Where): boolean {
  if (w.id !== undefined && r.id !== w.id) return false;
  if (w.userId !== undefined && r.userId !== w.userId) return false;
  if (w.status !== undefined && r.status !== w.status) return false;
  if (w.kind !== undefined && r.kind !== w.kind) return false;
  if (w.expiresAt?.gt && !(r.expiresAt.getTime() > w.expiresAt.gt.getTime())) return false;
  if (w.expiresAt?.lte && !(r.expiresAt.getTime() <= w.expiresAt.lte.getTime())) return false;
  if (w.decidedAt?.lt && !(r.decidedAt && r.decidedAt.getTime() < w.decidedAt.lt.getTime())) return false;
  return true;
}

const req = (body: unknown) => ({ json: async () => body }) as never;

describe('autonomy raise is Class C', () => {
  let rows: Row[];
  let profiles: Profile[];
  let ledgerRows: Array<Record<string, unknown>>;
  let seq: number;

  beforeEach(() => {
    vi.resetModules();
    rows = []; ledgerRows = []; seq = 0;
    profiles = [{ userId: 'u1', autonomyLevel: 1 }, { userId: 'u2', autonomyLevel: 1 }];
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
    const userProfile = {
      findUnique: async ({ where }: { where: { userId: string } }) => {
        const p = profiles.find((x) => x.userId === where.userId);
        return p ? { ...p } : null;
      },
      upsert: async ({ where, update, create }: { where: { userId: string }; update: Partial<Profile>; create: Partial<Profile> & { userId: string } }) => {
        const p = profiles.find((x) => x.userId === where.userId);
        if (p) Object.assign(p, update); else profiles.push({ autonomyLevel: 1, ...create });
        return {};
      },
      updateMany: async ({ where, data }: { where: { userId: string; autonomyLevel: number }; data: { autonomyLevel: number } }) => {
        await Promise.resolve();
        let count = 0;
        for (const p of profiles) if (p.userId === where.userId && p.autonomyLevel === where.autonomyLevel) { p.autonomyLevel = data.autonomyLevel; count++; }
        return { count };
      },
    };
    vi.doMock('@/lib/db', () => ({
      prisma: {
        approvalRequest,
        userProfile,
        userPreference: { upsert: async () => ({}) },
        user: { update: async () => ({}) },
        conversation: { findFirst: async () => null },
      },
    }));
    const write = async (e: Record<string, unknown>) => { ledgerRows.push(e); };
    vi.doMock('@/lib/ledger', () => ({ recordAction: write, recordActionSafe: write }));
    vi.doMock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), security: vi.fn(), debug: vi.fn() } }));
    vi.doMock('@/lib/approval-handler', () => ({ buildDispatchMessage: vi.fn() }));
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
  });

  const level = (u = 'u1') => profiles.find((p) => p.userId === u)?.autonomyLevel;
  async function patch(body: unknown) {
    const { PATCH } = await import('../../app/api/settings/route');
    const res = await PATCH(req(body));
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  }
  async function raise(to = 3) {
    const r = await patch({ profile: { autonomyLevel: to } });
    expect(r.status).toBe(202);
    return r.body.approval.id as string;
  }

  it('raise returns 202 with an approval and leaves the level unchanged', async () => {
    const r = await patch({ profile: { autonomyLevel: 3 } });
    expect(r.status).toBe(202);
    expect(r.body.requiresApproval).toBe(true);
    expect(r.body.approval).toMatchObject({
      kind: 'autonomy_change', tool: null, permissionClass: 'C',
      params: { from: 1, to: 3 }, summary: 'Raise autonomy from level 1 to level 3',
    });
    expect(level()).toBe(1);
    expect(rows[0].status).toBe('PENDING');
  });

  it('other fields are applied alongside a raise', async () => {
    const r = await patch({ profile: { autonomyLevel: 2, timezone: 'America/Edmonton', displayName: 'V' } });
    expect(r.status).toBe(202);
    expect(profiles[0]).toMatchObject({ timezone: 'America/Edmonton', displayName: 'V', autonomyLevel: 1 });
  });

  it('approve raises exactly once; concurrent approvals apply once', async () => {
    const id = await raise(3);
    const { decide } = await import('../approvals');
    const outs = await Promise.all(Array.from({ length: 10 }, () => decide('u1', id, 'approve')));
    expect(outs.filter((o) => o.status === 'EXECUTED')).toHaveLength(1);
    expect(level()).toBe(3);
    const changes = ledgerRows.filter((l) => l.action === 'autonomy_level_change');
    expect(changes).toHaveLength(1);
    expect(changes[0].status).toBe('VALIDATED');
    expect(JSON.parse(changes[0].validationResult as string)).toEqual({ from: 1, to: 3, approvalId: id });
  });

  it('deny leaves the level unchanged', async () => {
    const id = await raise(3);
    const { decide } = await import('../approvals');
    expect((await decide('u1', id, 'deny')).status).toBe('DENIED');
    expect(level()).toBe(1);
  });

  it('expiry leaves the level unchanged', async () => {
    const id = await raise(3);
    const { decide } = await import('../approvals');
    const out = await decide('u1', id, 'approve', { now: () => new Date(Date.now() + 31_000) });
    expect(out.status).toBe('EXPIRED');
    expect(level()).toBe(1);
  });

  it('level changed between request and approval: FAILED, not applied', async () => {
    const id = await raise(3);
    profiles[0].autonomyLevel = 2;
    const { decide } = await import('../approvals');
    const out = await decide('u1', id, 'approve');
    expect(out.status).toBe('FAILED');
    expect(level()).toBe(2);
    expect(ledgerRows.find((l) => l.action === 'autonomy_level_change')?.status).toBe('FAILED');
  });

  it('invalid stored params (hash intact) are FAILED, not applied', async () => {
    const { approvalContentHash } = await import('../canonical-json');
    const { createApproval, decide } = await import('../approvals');
    const a = await createApproval({
      userId: 'u1', kind: 'autonomy_change', params: { from: 1, to: 9 }, correlationId: 'c1', summary: 's',
    });
    expect(a.contentHash).toBe(approvalContentHash({ kind: 'autonomy_change', tool: null, params: { from: 1, to: 9 } }));
    const out = await decide('u1', a.id, 'approve');
    expect(out.status).toBe('FAILED');
    expect(level()).toBe(1);
  });

  it('tampered stored params fail the hash lock', async () => {
    const id = await raise(2);
    rows[0].params = { from: 1, to: 4 };
    const { decide } = await import('../approvals');
    expect((await decide('u1', id, 'approve')).status).toBe('FAILED');
    expect(level()).toBe(1);
  });

  it('duplicate pending raise returns 409 with the pending approval', async () => {
    const id = await raise(3);
    const r = await patch({ profile: { autonomyLevel: 4 } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('An autonomy change is already awaiting approval');
    expect(r.body.approval.id).toBe(id);
    expect(rows).toHaveLength(1);
  });

  it('lowering is immediate and ledgered; same level is ignored', async () => {
    profiles[0].autonomyLevel = 3;
    const low = await patch({ profile: { autonomyLevel: 1 } });
    expect(low.status).toBe(200);
    expect(level()).toBe(1);
    expect(ledgerRows.some((l) => l.action === 'autonomy_level_change' && l.status === 'VALIDATED')).toBe(true);
    const same = await patch({ profile: { autonomyLevel: 1 } });
    expect(same.status).toBe(200);
    expect(rows).toHaveLength(0);
  });

  it("another user cannot decide this user's approval", async () => {
    const id = await raise(3);
    const { decide } = await import('../approvals');
    expect((await decide('u2', id, 'approve')).status).toBe('NOT_FOUND');
    expect(level()).toBe(1);
    expect(level('u2')).toBe(1);
  });
});

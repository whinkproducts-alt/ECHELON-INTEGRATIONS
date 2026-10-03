/**
 * Integration test of lib/approvals.ts against the REAL local Postgres.
 *
 * Real: prisma, ledger, permission engine, approvals, tool-registry.
 * Mocked: only lib/openclaw-client (the external gateway boundary). TOOL_HANDLERS is
 * not exported, so a counting handler is installed the way production does it:
 * registerOpenClawTools() registers `openclaw__<name>` tools, which default to Class C.
 *
 * If Postgres is unreachable every test skips, so CI without a database stays green.
 * Credentials are never printed.
 */
import { describe, it, expect, vi, beforeAll, afterAll, type TestContext } from 'vitest';

const TOOL_NAME = 'itest__counter';
const TOOL = `openclaw__${TOOL_NAME}`;
let handlerCalls = 0;

vi.mock('@/lib/openclaw-client', () => ({
  isGatewayConfigured: () => true,
  listOpenClawTools: vi.fn(async () => [
    { name: TOOL_NAME, description: 'counting probe', inputSchema: { type: 'object', properties: {} } },
  ]),
  callOpenClawTool: vi.fn(async () => {
    handlerCalls++;
    return { ok: true };
  }),
}));

type Prisma = typeof import('@/lib/db')['prisma'];
type Approvals = typeof import('@/lib/approvals');

let prisma: Prisma;
let approvals: Approvals;
let dbUp = false;
let userA = '';
let userB = '';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function need(ctx: TestContext) {
  if (!dbUp) ctx.skip();
}

async function makeApproval(params: Record<string, unknown> = { n: 1 }, at?: Date) {
  return approvals.createApproval({
    userId: userA,
    kind: 'tool_call',
    tool: TOOL,
    params,
    correlationId: `itest-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    now: at ? () => at : undefined,
  });
}

async function ledgerFor(userId: string, approvalId: string) {
  const rows = await prisma.action.findMany({ where: { userId } });
  return rows.filter((r) => (r.validationResult ?? '').includes(approvalId));
}

async function rowOf(id: string) {
  return prisma.approvalRequest.findFirst({ where: { id } });
}

beforeAll(async () => {
  try {
    ({ prisma } = await import('@/lib/db'));
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rej) => setTimeout(() => rej(new Error('db probe timeout')), 4000)),
    ]);
    // Table must exist (migrations applied).
    await prisma.approvalRequest.count({ where: { id: 'probe' } });
    dbUp = true;
  } catch {
    dbUp = false;
    return;
  }
  approvals = await import('@/lib/approvals');
  const { registerOpenClawTools } = await import('@/lib/tool-registry');
  const a = await prisma.user.create({ data: { email: `approvals-itest-a-${stamp}@example.test`, name: 'itest A' } });
  const b = await prisma.user.create({ data: { email: `approvals-itest-b-${stamp}@example.test`, name: 'itest B' } });
  userA = a.id;
  userB = b.id;
  await registerOpenClawTools(userA);
}, 15000);

afterAll(async () => {
  if (!dbUp) return;
  const ids = [userA, userB].filter(Boolean);
  try {
    await prisma.approvalRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.action.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await prisma.$disconnect();
  }
}, 15000);

describe('approvals integration (real Postgres)', () => {
  it('exactly once: 20 concurrent approves run the handler once', async (ctx) => {
    need(ctx);
    const a = await makeApproval({ case: 'once' });
    expect(a.permissionClass).toBe('C');
    handlerCalls = 0;

    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () => approvals.decide(userA, a.id, 'approve')),
    );

    expect(handlerCalls).toBe(1);
    expect(outcomes.filter((o) => o.status === 'EXECUTED')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'ALREADY_DECIDED')).toHaveLength(19);
    const row = await rowOf(a.id);
    expect(row?.status).toBe('EXECUTED');
  }, 30000);

  it('approve vs deny race (10 each): exactly one winner; deny win never runs handler', async (ctx) => {
    need(ctx);
    const a = await makeApproval({ case: 'race' });
    handlerCalls = 0;

    const calls = [
      ...Array.from({ length: 10 }, () => approvals.decide(userA, a.id, 'approve')),
      ...Array.from({ length: 10 }, () => approvals.decide(userA, a.id, 'deny')),
    ];
    const outcomes = await Promise.all(calls);

    const winners = outcomes.filter((o) => o.status === 'EXECUTED' || o.status === 'DENIED' || o.status === 'FAILED');
    expect(winners).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'ALREADY_DECIDED')).toHaveLength(19);

    const row = await rowOf(a.id);
    if (winners[0].status === 'DENIED') {
      expect(handlerCalls).toBe(0);
      expect(row?.status).toBe('DENIED');
    } else {
      expect(handlerCalls).toBe(1);
      expect(row?.status).toBe('EXECUTED');
    }
  }, 30000);

  it('expiry: decide at createdAt+30_001ms is EXPIRED and never runs', async (ctx) => {
    need(ctx);
    const created = new Date();
    const a = await makeApproval({ case: 'expiry' }, created);
    handlerCalls = 0;

    const late = () => new Date(created.getTime() + 30_001);
    const out = await approvals.decide(userA, a.id, 'approve', { now: late });

    expect(out.status).toBe('EXPIRED');
    expect(handlerCalls).toBe(0);
    expect((await rowOf(a.id))?.status).toBe('EXPIRED');
    // Later retries stay EXPIRED, still no execution.
    const again = await approvals.decide(userA, a.id, 'approve');
    expect(again.status).toBe('EXPIRED');
    expect(handlerCalls).toBe(0);
  });

  it('cross-tenant: another user deciding this id gets NOT_FOUND and the row is unchanged', async (ctx) => {
    need(ctx);
    const a = await makeApproval({ case: 'tenant' });
    const before = await rowOf(a.id);
    handlerCalls = 0;

    const approveOut = await approvals.decide(userB, a.id, 'approve');
    const denyOut = await approvals.decide(userB, a.id, 'deny');

    expect(approveOut.status).toBe('NOT_FOUND');
    expect(denyOut.status).toBe('NOT_FOUND');
    expect(handlerCalls).toBe(0);
    const after = await rowOf(a.id);
    expect(after?.status).toBe('PENDING');
    expect(after?.decidedAt).toBeNull();
    expect(after).toEqual(before);
    // B cannot see it in its pending list either; A still can.
    expect((await approvals.listPending(userB)).map((v) => v.id)).not.toContain(a.id);
    expect((await approvals.listPending(userA)).map((v) => v.id)).toContain(a.id);
    // Ledger rows for the approval belong to A only.
    expect((await ledgerFor(userB, a.id)).filter((r) => !r.action.startsWith('SECURITY_EVENT'))).toHaveLength(0);
  });

  it('ledger: one row per transition carrying the approval id', async (ctx) => {
    need(ctx);
    const exec = await makeApproval({ case: 'ledger-exec' });
    const den = await makeApproval({ case: 'ledger-deny' });
    const created = new Date();
    const exp = await makeApproval({ case: 'ledger-exp' }, created);

    await approvals.decide(userA, exec.id, 'approve');
    await approvals.decide(userA, den.id, 'deny');
    await approvals.decide(userA, exp.id, 'approve', { now: () => new Date(created.getTime() + 30_001) });

    const names = async (id: string) => (await ledgerFor(userA, id)).map((r) => r.action).sort();

    expect(await names(exec.id)).toEqual(
      [`tool_executed: ${TOOL}`, 'approval_approved', 'approval_created', 'approval_executed'].sort(),
    );
    expect(await names(den.id)).toEqual(['approval_created', 'approval_denied']);
    expect(await names(exp.id)).toEqual(['approval_created', 'approval_expired']);

    const created1 = (await ledgerFor(userA, exec.id)).find((r) => r.action === 'approval_created');
    expect(created1?.status).toBe('AWAITING_APPROVAL');
    expect(created1?.permissionClass).toBe('C');
    const denied = (await ledgerFor(userA, den.id)).find((r) => r.action === 'approval_denied');
    expect(denied?.status).toBe('DENIED');
    const expired = (await ledgerFor(userA, exp.id)).find((r) => r.action === 'approval_expired');
    expect(expired?.status).toBe('DENIED');
  }, 30000);

  it('autonomy_change: approve raises the level once; deny does not', async (ctx) => {
    need(ctx);
    const u = await prisma.user.create({ data: { email: `approvals-itest-c-${stamp}@example.test`, name: 'itest C' } });
    try {
      await prisma.userProfile.create({ data: { userId: u.id, autonomyLevel: 1 } });
      const mk = () => approvals.createApproval({
        userId: u.id, kind: 'autonomy_change', params: { from: 1, to: 2 },
        summary: 'Raise autonomy from level 1 to level 2', correlationId: `itest-${stamp}-auto`,
      });
      const denied = await mk();
      await approvals.decide(u.id, denied.id, 'deny');
      expect((await prisma.userProfile.findUnique({ where: { userId: u.id } }))?.autonomyLevel).toBe(1);

      const a = await mk();
      const outs = await Promise.all(Array.from({ length: 5 }, () => approvals.decide(u.id, a.id, 'approve')));
      expect(outs.filter((o) => o.status === 'EXECUTED')).toHaveLength(1);
      expect((await prisma.userProfile.findUnique({ where: { userId: u.id } }))?.autonomyLevel).toBe(2);
      const rowsL = (await prisma.action.findMany({ where: { userId: u.id } })).filter((r) => r.action === 'autonomy_level_change');
      expect(rowsL).toHaveLength(1);
      expect(rowsL[0].status).toBe('VALIDATED');

      // Cross-user cannot decide.
      const other = await mk();
      expect((await approvals.decide(userA, other.id, 'approve')).status).toBe('NOT_FOUND');
    } finally {
      await prisma.approvalRequest.deleteMany({ where: { userId: u.id } });
      await prisma.action.deleteMany({ where: { userId: u.id } });
      await prisma.user.deleteMany({ where: { id: u.id } });
    }
  }, 30000);
});

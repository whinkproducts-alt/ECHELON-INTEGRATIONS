import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalJson } from '@/lib/canonical-json';

// Real hashing, real auth, real owner lookup. Only the database and the ledger writer are faked.
process.env.MARCUS_BEARER_TOKEN_HASH = createHash('sha256').update('tok').digest('hex');
process.env.WHINK_OWNER_EMAILS = 'owner@example.com';

type Row = Record<string, any>;
const h = vi.hoisted(() => ({ jobs: [] as Row[], approvals: [] as Row[], scopes: [] as Row[], ledger: [] as Row[], hasOwner: true, seq: 0 }));

const dup = () => Object.assign(new Error('unique'), { code: 'P2002' });
const inList = (v: unknown, c: any) => (c?.in ? c.in.includes(v) : c === v);

vi.mock('@/lib/ledger', () => ({ recordAction: vi.fn(async (e: Row) => { h.ledger.push(e); return { id: `a${h.ledger.length}` }; }) }));
vi.mock('@/lib/db', () => {
  const p: Row = {
    user: { findUnique: async () => (h.hasOwner ? { id: 'u1', email: 'owner@example.com' } : null) },
    agentJob: {
      findUnique: async ({ where }: Row) => h.jobs.find((j) => j.jobKey === where.jobKey_userId.jobKey && j.userId === where.jobKey_userId.userId) ?? null,
      findFirst: async ({ where }: Row) => h.jobs.find((j) => j.id === where.id && j.jobKey.startsWith(where.jobKey.startsWith)) ?? null,
      findMany: async ({ where }: Row) => h.jobs.filter((j) => j.userId === where.userId && j.jobKey.startsWith(where.jobKey.startsWith) && inList(j.lastStatus, where.lastStatus)),
      create: async ({ data }: Row) => {
        if (h.jobs.some((j) => j.jobKey === data.jobKey && j.userId === data.userId)) throw dup();
        const row = { id: `job${++h.seq}`, createdAt: new Date(), ...data };
        h.jobs.push(row);
        return row;
      },
      upsert: async ({ where, create, update }: Row) => {
        const k = where.jobKey_userId;
        const found = h.jobs.find((j) => j.jobKey === k.jobKey && j.userId === k.userId);
        if (found) { Object.assign(found, update); return found; }
        const row = { id: `job${++h.seq}`, createdAt: new Date(), ...create };
        h.jobs.push(row);
        return row;
      },
      updateMany: async ({ where, data }: Row) => {
        const hit = h.jobs.filter((j) => where.id.in.includes(j.id) && j.userId === where.userId);
        hit.forEach((j) => Object.assign(j, data));
        return { count: hit.length };
      },
    },
    approvalRequest: {
      create: async ({ data }: Row) => {
        if (h.approvals.some((a) => a.id === data.id)) throw dup();
        const row = { executedAt: null, ...data };
        h.approvals.push(row);
        return row;
      },
      findFirst: async ({ where }: Row) => h.approvals.find((a) => a.id === where.id && (!where.userId || a.userId === where.userId)) ?? null,
      updateMany: async ({ where, data }: Row) => {
        const hit = h.approvals.filter((a) => a.id === where.id && a.userId === where.userId && a.executedAt === null);
        hit.forEach((a) => Object.assign(a, data));
        return { count: hit.length };
      },
    },
    sealedScope: { create: async ({ data }: Row) => { h.scopes.push(data); return data; } },
  };
  p.$transaction = async (fn: (tx: Row) => unknown) => fn(p);
  return { prisma: p };
});

const { intakeMarcusTask } = await import('@/lib/marcus/intake');
const { setMarcusFreeze } = await import('@/lib/marcus/freeze');
const { checkMarcusApproval } = await import('@/lib/permission-engine');
const { GET: eventsGet } = await import('@/app/api/integrations/marcus/events/route');

function body(over: Row = {}) {
  const b = { client_operation_id: 'op-1', title: 'Draft memo', goal: 'Summarise Q4', deadline: null, requested_for: 'victor', sensitivity: 'standard', directorate: null, ...over };
  const content_hash = createHash('sha256').update(canonicalJson({ title: b.title, goal: b.goal, deadline: b.deadline })).digest('hex');
  return { ...b, approval: { approval_id: over.approval_id ?? 'appr-1', approved_at: '2026-11-14T00:00:00Z', method: 'voice', content_hash, ...(over.approval ?? {}) } };
}
const post = (b: unknown, token = 'tok') =>
  intakeMarcusTask(new Request('http://x/api/integrations/marcus/tasks', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(b) }));

beforeEach(() => { h.jobs = []; h.approvals = []; h.scopes = []; h.ledger = []; h.hasOwner = true; h.seq = 0; });

describe('Marcus intake', () => {
  it('rejects a bad or missing token with 401 and writes nothing', async () => {
    expect((await post(body(), 'wrong')).status).toBe(401);
    expect(h.jobs).toHaveLength(0);
  });

  it('standard task: stored as received, approval recorded under the Marcus id, sealed, ledgered', async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('received');
    expect(h.approvals[0]).toMatchObject({ id: 'appr-1', status: 'APPROVED', permissionClass: 'A', userId: 'u1' });
    expect(h.scopes).toHaveLength(1);
    expect(h.ledger[0]).toMatchObject({ action: 'capability_marcus_task_received', userId: 'u1' });
    expect(h.jobs[0].userId).toBe('u1');
  });

  it.each(['financial', 'proprietary'])('%s task waits for reconfirmation as Class C', async (sensitivity) => {
    const res = await post(body({ sensitivity }));
    expect((await res.json()).status).toBe('reconfirmation_required');
    expect(h.approvals[0]).toMatchObject({ status: 'PENDING', permissionClass: 'C' });
    expect(h.ledger[0]).toMatchObject({ status: 'AWAITING_APPROVAL', errorCode: 'RECONFIRMATION_REQUIRED' });
  });

  it('rejects a content hash that does not match title+goal+deadline', async () => {
    const b = body();
    b.title = 'Changed after approval';
    expect((await post(b)).status).toBe(400);
    expect(h.jobs).toHaveLength(0);
  });

  it('same client_operation_id is idempotent: one task, same id back', async () => {
    const a = await (await post(body())).json();
    const b = await (await post(body())).json();
    expect(b.task_id).toBe(a.task_id);
    expect(h.jobs).toHaveLength(1);
  });

  it('an approval_id reused for a different operation gets 409', async () => {
    await post(body());
    const res = await post(body({ client_operation_id: 'op-2', title: 'Other', approval_id: 'appr-1' }));
    expect(res.status).toBe(409);
    expect(h.jobs).toHaveLength(1);
  });

  it('503 when no owner account is configured', async () => {
    h.hasOwner = false;
    expect((await post(body())).status).toBe(503);
  });

  it('rejects oversized or malformed fields', async () => {
    expect((await post(body({ goal: 'x'.repeat(10_001) }))).status).toBe(400);
    expect((await post(body({ sensitivity: 'secret' }))).status).toBe(400);
  });
});

describe('Marcus freeze', () => {
  it('freeze pauses tasks and blocks intake with 503; unfreeze re-queues and reopens intake', async () => {
    await post(body());
    expect(await setMarcusFreeze('u1', true)).toEqual(['job1']);
    expect(h.jobs.find((j) => j.id === 'job1')?.lastStatus).toBe('frozen');
    expect((await post(body({ client_operation_id: 'op-2', approval_id: 'appr-2', title: 'B' }))).status).toBe(503);
    expect(await setMarcusFreeze('u1', false)).toEqual(['job1']);
    expect(h.jobs.find((j) => j.id === 'job1')?.lastStatus).toBe('received');
    expect((await post(body({ client_operation_id: 'op-2', approval_id: 'appr-2', title: 'B' }))).status).toBe(200);
    expect(h.ledger.map((l) => l.action)).toEqual(expect.arrayContaining(['capability_marcus_task_frozen', 'capability_marcus_task_unfrozen']));
  });
});

describe('Marcus approval carry-over', () => {
  it('standard approval is consumed exactly once', async () => {
    await post(body());
    const row = h.approvals[0];
    const first = await checkMarcusApproval('u1', 'appr-1', 'marcus_task_intake', row.contentHash, 'standard');
    expect(first).toEqual({ allowed: true, method: 'human_approved' });
    const second = await checkMarcusApproval('u1', 'appr-1', 'marcus_task_intake', row.contentHash, 'standard');
    expect(second.allowed).toBe(false);
  });

  it('financial approval stays blocked and flagged as protected money', async () => {
    await post(body({ sensitivity: 'financial' }));
    const r = await checkMarcusApproval('u1', 'appr-1', 'marcus_task_intake', h.approvals[0].contentHash, 'financial');
    expect(r).toMatchObject({ allowed: false, protected: true, category: 'money' });
  });

  it('a tampered hash is denied', async () => {
    await post(body());
    const r = await checkMarcusApproval('u1', 'appr-1', 'marcus_task_intake', 'deadbeef', 'standard');
    expect(r.allowed).toBe(false);
  });
});

describe('Marcus events', () => {
  it('only serves events for marcus: jobs, not any ECHELON job id', async () => {
    h.jobs.push({ id: 'ear-job', jobKey: 'ear:123', userId: 'u1', createdAt: new Date() });
    const res = await eventsGet(new Request('http://x/api/integrations/marcus/events?task_id=ear-job', { headers: { authorization: 'Bearer tok' } }));
    expect(res.status).toBe(404);
  });
});

describe('Marcus persona', () => {
  it('is registered as a non-board intake agent', async () => {
    const { PERSONAS } = await import('@/lib/personas');
    expect(PERSONAS.MARCUS).toMatchObject({ id: 'MARCUS', isBoardMember: false });
  });
});

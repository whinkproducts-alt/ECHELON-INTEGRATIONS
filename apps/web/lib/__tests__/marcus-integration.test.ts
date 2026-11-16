import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalJson } from '@/lib/canonical-json';
import { lockdownTestState } from './setup/lockdown-mock';

// Real hashing, real auth, real owner lookup. Only the database and the ledger writer are faked.
process.env.MARCUS_BEARER_TOKEN_HASH = createHash('sha256').update('tok').digest('hex');
process.env.WHINK_OWNER_EMAILS = 'owner@example.com';
process.env.ENCRYPTION_KEY = 'ab'.repeat(32);

type Row = Record<string, any>;
const h = vi.hoisted(() => ({ jobs: [] as Row[], approvals: [] as Row[], scopes: [] as Row[], ledger: [] as Row[], hasOwner: true, seq: 0, freezes: {} as Record<string, boolean> }));

const dup = () => Object.assign(new Error('unique'), { code: 'P2002' });
const inList = (v: unknown, c: any) => (c?.in ? c.in.includes(v) : c === v);

vi.mock('@/lib/ledger', () => ({ recordAction: vi.fn(async (e: Row) => { h.ledger.push({ ...e, id: `a${String(h.ledger.length + 1).padStart(3, '0')}`, createdAt: new Date(1_800_000_000_000 + h.ledger.length * 1000) }); return { id: 'x' }; }) }));
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
        const hit = h.jobs.filter((j) => (where.id.in ? where.id.in.includes(j.id) : where.id === j.id) && j.userId === where.userId && (where.lastStatus === undefined || inList(j.lastStatus, where.lastStatus)));
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
        const hit = h.approvals.filter((a) => a.id === where.id && a.userId === where.userId && (where.executedAt === undefined || a.executedAt === where.executedAt) && (where.status === undefined || a.status === where.status));
        hit.forEach((a) => Object.assign(a, data));
        return { count: hit.length };
      },
    },
    marcusFreeze: {
      findUnique: async ({ where }: Row) => (where.userId in h.freezes ? { frozen: h.freezes[where.userId] } : null),
      upsert: async ({ where, create }: Row) => { h.freezes[where.userId] = create.frozen; return create; },
    },
    sealedScope: { create: async ({ data }: Row) => { h.scopes.push(data); return data; } },
    action: {
      findMany: async ({ where, take }: Row) => {
        const after = where.AND?.[0]?.OR?.[0]?.createdAt?.gt as Date | undefined;
        return h.ledger.filter((l) => l.userId === where.userId && where.action.in.includes(l.action) && (!after || l.createdAt > after)).slice(0, take);
      },
      findFirst: async ({ where }: Row) => [...h.ledger].reverse().find((l) => l.userId === where.userId && where.action.in.includes(l.action)) ?? null,
    },
  };
  p.$transaction = async (fn: (tx: Row) => unknown) => fn(p);
  return { prisma: p };
});

const { intakeMarcusTask } = await import('@/lib/marcus/intake');
const { setMarcusFreeze } = await import('@/lib/marcus/freeze');
const { checkMarcusApproval } = await import('@/lib/permission-engine');
const { GET: eventsGet } = await import('@/app/api/integrations/marcus/events/route');
const { marcusEventsAfter } = await import('@/lib/marcus/feed');
const { encodeCursor } = await import('@/lib/capability/events');
const { confirmMarcusTask, resumeMarcusTask, getMarcusTask } = await import('@/lib/marcus/tasks');

function body(over: Row = {}) {
  const b = { client_operation_id: 'op-1', title: 'Draft memo', goal: 'Summarise Q4', deadline: null, requested_for: 'victor', sensitivity: 'standard', directorate: null, ...over };
  const content_hash = createHash('sha256').update(canonicalJson({ title: b.title, goal: b.goal, deadline: b.deadline })).digest('hex');
  return { ...b, approval: { approval_id: over.approval_id ?? 'appr-1', approved_at: '2026-11-14T00:00:00Z', method: 'voice', content_hash, ...(over.approval ?? {}) } };
}
const post = (b: unknown, token = 'tok') =>
  intakeMarcusTask(new Request('http://x/api/integrations/marcus/tasks', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(b) }));

beforeEach(() => { h.jobs = []; h.approvals = []; h.scopes = []; h.ledger = []; h.hasOwner = true; h.seq = 0; h.freezes = {}; });

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

  it('accepts origin and target subsidiaries and a directorate, storing them only inside the encrypted task text', async () => {
    const res = await post(body({ subsidiary: 'consult', target_subsidiaries: ['trades', 'apps'], directorate: 'Finance' }));
    expect(res.status).toBe(200);
    const { decryptKey } = await import('@/lib/key-encryption');
    const stored = JSON.parse(decryptKey(h.jobs[0].capabilityRequestEnc));
    expect(stored).toMatchObject({ subsidiary: 'consult', targets: ['trades', 'apps'], directorate: 'Finance' });
    expect(JSON.stringify(h.jobs[0])).not.toContain('Finance'); // nothing readable beside the ciphertext
  });

  it('rejects an unknown subsidiary or an unknown target, and stores nothing', async () => {
    expect((await post(body({ subsidiary: 'nope' }))).status).toBe(400);
    expect((await post(body({ target_subsidiaries: ['trades', 'bogus'] }))).status).toBe(400);
    expect((await post(body({ directorate: 'x'.repeat(101) }))).status).toBe(400);
    expect(h.jobs).toHaveLength(0);
    expect(h.approvals).toHaveLength(0);
  });

  it('503 and nothing stored when no encryption key is configured', async () => {
    const key = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      expect((await post(body())).status).toBe(503);
      expect(h.jobs).toHaveLength(0);
      expect(h.approvals).toHaveLength(0);
    } finally {
      process.env.ENCRYPTION_KEY = key;
    }
  });

  it('503 while the account is in lockdown', async () => {
    lockdownTestState.locked = true;
    expect((await post(body())).status).toBe(503);
    expect(h.jobs).toHaveLength(0);
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

describe('Marcus task endpoints', () => {
  const second = (b: Row, id = 'appr-2', hash = b.approval.content_hash) => ({ approval_id: id, approved_at: '2026-11-14T00:01:00Z', method: 'voice', content_hash: hash });

  it('GET returns the task Marcus created and 404 for anything else', async () => {
    const t = await (await post(body())).json();
    expect(await getMarcusTask('u1', t.task_id)).toMatchObject({ status: 200, body: { task_id: t.task_id, client_operation_id: 'op-1', status: 'received' } });
    h.jobs.push({ id: 'ear-job', jobKey: 'ear:1', userId: 'u1', createdAt: new Date() });
    expect((await getMarcusTask('u1', 'ear-job')).status).toBe(404);
  });

  it('confirm moves a financial task to received, closes the pending card, and cannot be replayed', async () => {
    const b = body({ sensitivity: 'financial' });
    const t = await (await post(b)).json();
    const ok = await confirmMarcusTask('u1', t.task_id, second(b));
    expect(ok).toMatchObject({ status: 200, body: { status: 'received' } });
    expect(h.approvals.find((a) => a.id === 'appr-1')?.status).toBe('APPROVED');
    expect(h.approvals.find((a) => a.id === 'appr-2')).toMatchObject({ status: 'APPROVED', permissionClass: 'C' });
    expect(h.ledger.at(-1)).toMatchObject({ action: 'capability_marcus_task_reconfirmed' });
    expect((await confirmMarcusTask('u1', t.task_id, second(b, 'appr-3'))).status).toBe(409);
  });

  it('confirm refuses the first approval again, a wrong hash, a standard task, and unknown tasks', async () => {
    const b = body({ sensitivity: 'proprietary' });
    const t = await (await post(b)).json();
    expect((await confirmMarcusTask('u1', t.task_id, second(b, 'appr-1'))).status).toBe(400);
    expect((await confirmMarcusTask('u1', t.task_id, second(b, 'appr-2', 'f'.repeat(64)))).status).toBe(400);
    expect((await confirmMarcusTask('u1', t.task_id, { approval_id: 'x' })).status).toBe(400);
    expect((await confirmMarcusTask('u1', 'nope', second(b))).status).toBe(404);
    const std = body({ client_operation_id: 'op-9', approval_id: 'appr-9' });
    const s = await (await post(std)).json();
    expect((await confirmMarcusTask('u1', s.task_id, second(std, 'appr-10'))).status).toBe(409);
  });

  it('a replayed second approval id gets 409 and leaves the task waiting', async () => {
    const b = body({ sensitivity: 'financial' });
    const t = await (await post(b)).json();
    expect((await confirmMarcusTask('u1', t.task_id, second(b, 'appr-1'))).status).toBe(400);
    expect(h.jobs.find((j) => j.id === t.task_id)?.lastStatus).toBe('reconfirmation_required');
  });

  it('resume only works on a blocked or paused task', async () => {
    const t = await (await post(body())).json();
    expect((await resumeMarcusTask('u1', t.task_id)).status).toBe(409);
    h.jobs.find((j) => j.id === t.task_id)!.lastStatus = 'blocked';
    expect(await resumeMarcusTask('u1', t.task_id)).toMatchObject({ status: 200, body: { status: 'received' } });
  });
});

describe('Marcus event feed', () => {
  it('emits {task_id, status} for each change, in order, and resumes after a cursor', async () => {
    const a = await (await post(body())).json();
    const f = await (await post(body({ client_operation_id: 'op-2', approval_id: 'appr-2', title: 'Pay', sensitivity: 'financial' }))).json();
    await setMarcusFreeze('u1', true);
    const all = await marcusEventsAfter('u1', null);
    expect(all.map((e) => (e.data as Row).status)).toEqual(['received', 'reconfirmation_required', 'frozen', 'frozen']);
    expect((all[0].data as Row).task_id).toBe(a.task_id);
    expect((all[1].data as Row).task_id).toBe(f.task_id);
    const { decodeCursor } = await import('@/lib/capability/events');
    const after = await marcusEventsAfter('u1', decodeCursor(all[1].id));
    expect(after.map((e) => (e.data as Row).status)).toEqual(['frozen', 'frozen']);
  });

  it('SSE route needs the bearer and streams id/event/data frames Marcus can parse', async () => {
    expect((await eventsGet(new Request('http://x/api/integrations/marcus/events'))).status).toBe(401);
    await post(body());
    const ac = new AbortController();
    const res = await eventsGet(new Request(`http://x/api/integrations/marcus/events?cursor=${encodeCursor({ createdAt: 1, id: 'a' })}`, { headers: { authorization: 'Bearer tok' }, signal: ac.signal }));
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body!.getReader();
    let text = '';
    while (!text.includes('data:')) text += new TextDecoder().decode((await reader.read()).value);
    ac.abort();
    expect(text).toMatch(/id: \S+\nevent: task_received\ndata: \{"task_id":"job1","status":"received"/);
  });
});

describe('Marcus persona', () => {
  it('is registered as a non-board intake agent', async () => {
    const { PERSONAS } = await import('@/lib/personas');
    expect(PERSONAS.MARCUS).toMatchObject({ id: 'MARCUS', isBoardMember: false });
  });
});

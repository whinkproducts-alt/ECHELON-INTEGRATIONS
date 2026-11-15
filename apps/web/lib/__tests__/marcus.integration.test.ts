/** Real Postgres: the Marcus intake, confirm, freeze, feed and single-use approval, with no database fake. Opt in with M1_EXECUTION_DATABASE_URL=$DATABASE_URL (a disposable *test* database). */
import { randomUUID, createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
vi.unmock('@/lib/safety/lockdown');
import { prisma } from '@/lib/db';
import { canonicalJson } from '@/lib/canonical-json';
import { setLockdown } from '@/lib/safety/lockdown';
import { claimDueJobs } from '@/lib/worker/scheduler';

const enabled = !!process.env.M1_EXECUTION_DATABASE_URL;
const TOKEN = `tok-${randomUUID()}`;
let owner = '';
let intake: typeof import('@/lib/marcus/intake').intakeMarcusTask;
let freeze: typeof import('@/lib/marcus/freeze');
let tasks: typeof import('@/lib/marcus/tasks');
let feed: typeof import('@/lib/marcus/feed');
let checkMarcusApproval: typeof import('@/lib/permission-engine').checkMarcusApproval;

const body = (over: Record<string, unknown> = {}) => {
  const b = { client_operation_id: `op-${randomUUID()}`, title: 'Draft memo', goal: 'Summarise Q4', deadline: null, requested_for: 'victor', sensitivity: 'standard', directorate: null, ...over };
  const content_hash = createHash('sha256').update(canonicalJson({ title: b.title, goal: b.goal, deadline: b.deadline })).digest('hex');
  return { ...b, approval: { approval_id: `appr-${randomUUID()}`, approved_at: '2026-11-14T00:00:00Z', method: 'voice', content_hash } };
};
const post = (b: unknown) => intake(new Request('http://x/api/integrations/marcus/tasks', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(b) }));

describe.skipIf(!enabled)('marcus real database integration', () => {
  beforeAll(async () => {
    if (process.env.M1_EXECUTION_DATABASE_URL !== process.env.DATABASE_URL || !/test/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error('Isolated test database required');
    const email = `marcus-owner-${randomUUID()}@example.test`;
    owner = (await prisma.user.create({ data: { email } })).id;
    vi.stubEnv('WHINK_OWNER_EMAILS', email);
    vi.stubEnv('MARCUS_BEARER_TOKEN_HASH', createHash('sha256').update(TOKEN).digest('hex'));
    ({ intakeMarcusTask: intake } = await import('@/lib/marcus/intake'));
    freeze = await import('@/lib/marcus/freeze');
    tasks = await import('@/lib/marcus/tasks');
    feed = await import('@/lib/marcus/feed');
    ({ checkMarcusApproval } = await import('@/lib/permission-engine'));
  });
  afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); });

  it('stores a standard task with its approval, sealed scope and ledger row, and the worker never claims it', async () => {
    const b = body();
    const res = await post(b);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.status).toBe('received');
    expect(await prisma.approvalRequest.findUniqueOrThrow({ where: { id: b.approval.approval_id } })).toMatchObject({ userId: owner, status: 'APPROVED', permissionClass: 'A' });
    expect(await prisma.sealedScope.findFirst({ where: { kind: 'OBJECTIVE', refId: out.task_id, userId: owner } })).not.toBeNull();
    expect(await prisma.action.findFirst({ where: { userId: owner, correlationId: `marcus-task:${out.task_id}`, action: 'capability_marcus_task_received' } })).not.toBeNull();
    const claimed = await claimDueJobs(`marcus-it-${randomUUID()}`, 1000);
    expect(claimed.map((j) => j.id)).not.toContain(out.task_id);
  });

  it('a replayed approval id gets 409 from the real unique violation and leaves no second task', async () => {
    const first = body();
    expect((await post(first)).status).toBe(200);
    const replay = { ...body(), approval: { ...body().approval, approval_id: first.approval.approval_id } };
    const res = await post(replay);
    expect(res.status).toBe(409);
    expect(await prisma.agentJob.count({ where: { userId: owner, jobKey: `marcus:${replay.client_operation_id}` } })).toBe(0);
  });

  it('the same client_operation_id is idempotent', async () => {
    const b = body();
    const a = await (await post(b)).json();
    const again = await (await post(b)).json();
    expect(again.task_id).toBe(a.task_id);
    expect(await prisma.agentJob.count({ where: { userId: owner, jobKey: `marcus:${b.client_operation_id}` } })).toBe(1);
  });

  it('financial task waits, then confirm moves it to received once; the first approval card is closed', async () => {
    const b = body({ sensitivity: 'financial' });
    const t = await (await post(b)).json();
    expect(t.status).toBe('reconfirmation_required');
    const second = { approval_id: `appr-${randomUUID()}`, approved_at: '2026-11-14T00:01:00Z', method: 'voice', content_hash: b.approval.content_hash };
    expect(await tasks.confirmMarcusTask(owner, t.task_id, second)).toMatchObject({ status: 200, body: { status: 'received' } });
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: b.approval.approval_id } })).status).toBe('APPROVED');
    expect((await tasks.confirmMarcusTask(owner, t.task_id, { ...second, approval_id: `appr-${randomUUID()}` })).status).toBe(409);
    expect((await tasks.getMarcusTask(owner, t.task_id)).body.status).toBe('received');
  });

  it('a standard approval is consumed by exactly one of ten concurrent callers', async () => {
    const b = body();
    await post(b);
    const row = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: b.approval.approval_id } });
    const results = await Promise.all(Array.from({ length: 10 }, () => checkMarcusApproval(owner, row.id, 'marcus_task_intake', row.contentHash, 'standard')));
    expect(results.filter((r) => r.allowed)).toHaveLength(1);
  });

  it('freeze pauses the task and blocks intake; unfreeze re-queues and reopens it; the feed reports both', async () => {
    const b = body();
    const t = await (await post(b)).json();
    expect(await freeze.setMarcusFreeze(owner, true)).toContain(t.task_id);
    expect((await tasks.getMarcusTask(owner, t.task_id)).body.status).toBe('frozen');
    expect((await post(body())).status).toBe(503);
    expect(await freeze.setMarcusFreeze(owner, false)).toContain(t.task_id);
    expect((await post(body())).status).toBe(200);
    const events = (await feed.marcusEventsAfter(owner, null, 1000)).filter((e) => (e.data as { task_id: string }).task_id === t.task_id);
    expect(events.map((e) => (e.data as { status: string }).status)).toEqual(['received', 'frozen', 'received']);
  });

  it('feed cursor resumes strictly after the given event, with no repeats', async () => {
    const all = await feed.marcusEventsAfter(owner, null, 1000);
    const { decodeCursor } = await import('@/lib/capability/events');
    const mid = Math.floor(all.length / 2);
    const rest = await feed.marcusEventsAfter(owner, decodeCursor(all[mid].id), 1000);
    expect(rest.map((e) => e.id)).toEqual(all.slice(mid + 1).map((e) => e.id));
  });

  it('account lockdown refuses intake with 503 and release reopens it', async () => {
    expect((await setLockdown(owner, true, { reason: 'test' })).ok).toBe(true);
    expect((await post(body())).status).toBe(503);
    expect((await setLockdown(owner, false)).ok).toBe(true);
    expect((await post(body())).status).toBe(200);
  });
});

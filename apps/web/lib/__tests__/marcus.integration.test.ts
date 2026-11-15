/** Real Postgres: the Marcus intake, confirm, freeze, feed and single-use approval, with no database fake. Opt in with M1_EXECUTION_DATABASE_URL=$DATABASE_URL (a disposable *test* database). */
import { randomUUID, createHash } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
vi.unmock('@/lib/safety/lockdown');
const model = vi.hoisted(() => ({ call: vi.fn(), admission: vi.fn() }));
vi.mock('@/lib/model-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/model-router')>(), chatOnce: model.call, verifyLocalAnalysisModel: model.admission,
}));
import { prisma } from '@/lib/db';
import { canonicalJson } from '@/lib/canonical-json';
import { setLockdown } from '@/lib/safety/lockdown';
import { runClaimedJob } from '@/lib/worker/runner';

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
    vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32));
    vi.stubEnv('MARCUS_BEARER_TOKEN_HASH', createHash('sha256').update(TOKEN).digest('hex'));
    ({ intakeMarcusTask: intake } = await import('@/lib/marcus/intake'));
    freeze = await import('@/lib/marcus/freeze');
    tasks = await import('@/lib/marcus/tasks');
    feed = await import('@/lib/marcus/feed');
    ({ checkMarcusApproval } = await import('@/lib/permission-engine'));
  });
  afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); });

  it('stores a standard task with its approval, sealed scope and ledger row', async () => {
    const b = body();
    const res = await post(b);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.status).toBe('received');
    expect(await prisma.approvalRequest.findUniqueOrThrow({ where: { id: b.approval.approval_id } })).toMatchObject({ userId: owner, status: 'APPROVED', permissionClass: 'A' });
    expect(await prisma.sealedScope.findFirst({ where: { kind: 'OBJECTIVE', refId: out.task_id, userId: owner } })).not.toBeNull();
    expect(await prisma.action.findFirst({ where: { userId: owner, correlationId: `marcus-task:${out.task_id}`, action: 'capability_marcus_task_received' } })).not.toBeNull();
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

  describe('executor', () => {
    const worker = `marcus-exec-${randomUUID()}`;
    const reply = JSON.stringify({ result: 'Internal draft: verify the evidence before acting externally.', learnings: [], confidence: 0.6 });
    const task = (over: Record<string, unknown> = {}) => body({ title: 'Summarise the product roadmap', goal: 'Summarise Q4 product roadmap risks and milestones', ...over });
    const job = (taskId: string) => prisma.agentJob.findUniqueOrThrow({ where: { id: taskId } });
    /**
     * Lease only this job and run it through the worker's own dispatch. claimDueJobs would lease every due job in the
     * shared test database, starving the other real-database suites that run alongside this one.
     */
    async function tick(jobKey: string) {
      const row = await prisma.agentJob.findFirst({ where: { userId: owner, jobKey } });
      if (!row) return null;
      const leaseUntil = new Date(Date.now() + 600_000);
      await prisma.agentJob.update({ where: { id: row.id }, data: { leaseOwner: worker, leaseUntil } });
      return runClaimedJob({ id: row.id, jobKey, userId: owner, consecutiveFailures: row.consecutiveFailures, runs: row.runs, leaseUntil }, worker);
    }
    /** Parked = far-future nextRunAt, which is what keeps the claim query from ever returning the job. */
    const parked = async (id: string) => (await job(id)).nextRunAt.getTime() > Date.now() + 365 * 24 * 3600_000;
    const makeDue = (id: string) => prisma.agentJob.update({ where: { id }, data: { nextRunAt: new Date() } });
    beforeEach(() => {
      vi.stubEnv('DEFAULT_MODEL', 'existing-local-model');
      vi.stubEnv('SWARM_MODEL', 'existing-local-model');
      vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'http://127.0.0.1:11434/v1');
      model.call.mockReset().mockResolvedValue(reply);
      model.admission.mockReset().mockResolvedValue(true);
    });

    it('a Marcus task runs end to end: admitted, analysed by the EAR worker, reported done with its result, approval used once', async () => {
      const b = task();
      const t = await (await post(b)).json();
      const jobKey = `marcus:${b.client_operation_id}`;

      expect(await tick(jobKey)).toBe('OK');
      const started = await job(t.task_id);
      expect(started).toMatchObject({ lastStatus: 'in_progress', capabilityRequestEnc: null });
      expect(started.capabilityReceiptId).toBeTruthy();
      expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: b.approval.approval_id } })).status).toBe('EXECUTED');
      expect(await prisma.sealedScope.findFirst({ where: { kind: 'EXECUTION', refId: started.capabilityReceiptId!, userId: owner } })).not.toBeNull();
      expect((await prisma.agentExecution.findUniqueOrThrow({ where: { id: started.capabilityReceiptId! } })).status).toBe('QUEUED');

      expect(await tick(`ear:${started.capabilityReceiptId}`)).toBe('OK'); // the existing EAR worker does the analysis
      expect((await prisma.agentExecution.findUniqueOrThrow({ where: { id: started.capabilityReceiptId! } })).status).toBe('SUCCEEDED');

      await makeDue(t.task_id);
      expect(await tick(jobKey)).toBe('OK');
      expect((await job(t.task_id)).lastStatus).toBe('done');
      const got = await tasks.getMarcusTask(owner, t.task_id);
      expect(got.body.status).toBe('done');
      expect(got.body.result).toMatchObject({ untrusted: true });
      expect(JSON.stringify(got.body.result)).toContain('verify the evidence');
      expect(got.body.result_summary).toContain('verify the evidence'); // the field Marcus's client reads

      const statuses = (await feed.marcusEventsAfter(owner, null, 1000)).filter((e) => (e.data as { task_id: string }).task_id === t.task_id).map((e) => (e.data as { status: string }).status);
      expect(statuses).toEqual(['received', 'in_progress', 'done']);
      expect(await parked(t.task_id)).toBe(true); // finished: never claimed again
      await makeDue(t.task_id);
      expect(await tick(jobKey)).toBe('SKIPPED'); // even if forced, it does nothing and parks again
      expect(await parked(t.task_id)).toBe(true);
    });

    it('a task that names none of the router keywords still finds a team through the fallback skill', async () => {
      const b = task({ title: 'Tidy my week', goal: 'Think through what I should focus on this week' });
      const t = await (await post(b)).json();
      await tick(`marcus:${b.client_operation_id}`);
      expect(await job(t.task_id)).toMatchObject({ lastStatus: 'in_progress', lastError: null });
    });

    it('an inter-subsidiary request carries both subsidiaries and a directorate into the analysis', async () => {
      const b = task({ subsidiary: 'consult', target_subsidiaries: ['trades', 'apps'], directorate: 'finance', title: 'Joint budget review', goal: 'Think through a shared budget for a joint client engagement' });
      const t = await (await post(b)).json();
      expect(t.status).toBe('received');
      expect((await post(task({ subsidiary: 'nope' }))).status).toBe(400);
      await tick(`marcus:${b.client_operation_id}`);
      const started = await job(t.task_id);
      expect(started.lastStatus).toBe('in_progress');
      const ex = await prisma.agentExecution.findUniqueOrThrow({ where: { id: started.capabilityReceiptId! } });
      const ear = (await prisma.approvalRequest.findUniqueOrThrow({ where: { id: ex.approvalId } })).params as { objective: string };
      expect(ear.objective.startsWith('For Whink Consult, with Whink Trades & Investments, Whink Apps: ')).toBe(true);
      const { getOrgKit } = await import('@/lib/agent-loader');
      const lead = (await getOrgKit()).agents.find((a) => a.agent_id === ex.agentIds[0])!;
      expect(lead.directorate).toBe('Finance & Accounting'); // "finance" steered the lead
      const row = await prisma.action.findFirstOrThrow({ where: { userId: owner, correlationId: `marcus-task:${t.task_id}`, action: 'capability_marcus_task_started' } });
      expect(row.inputSummary).toContain('directorate=Finance & Accounting subsidiary=consult targets=trades,apps');
    });

    it('an inter-departmental request gets one specialist per department and starts', async () => {
      const b = task({ title: 'Launch plan', goal: 'Plan the product launch with a sales forecast, a legal and compliance review, a budget and recruiting a contractor' });
      const t = await (await post(b)).json();
      await tick(`marcus:${b.client_operation_id}`);
      const started = await job(t.task_id);
      expect(started, `ended ${started.lastStatus} (${started.lastError})`).toMatchObject({ lastStatus: 'in_progress' });
      const ex = await prisma.agentExecution.findUniqueOrThrow({ where: { id: started.capabilityReceiptId! } });
      const { getOrgKit } = await import('@/lib/agent-loader');
      const agents = (await getOrgKit()).agents.filter((a) => ex.agentIds.includes(a.agent_id));
      expect(agents.length).toBe(5);
      expect(new Set(agents.map((a) => a.directorate)).size).toBeGreaterThanOrEqual(4);
    });

    it('a request spanning more departments than one analysis may use is blocked with a clear reason and its approval kept', async () => {
      const b = task({ title: 'Everything review', goal: 'Plan the product launch with a sales forecast, a legal review, a budget, recruiting a contractor and a security review' });
      const t = await (await post(b)).json();
      await tick(`marcus:${b.client_operation_id}`);
      expect(await job(t.task_id)).toMatchObject({ lastStatus: 'blocked', lastError: 'too_many_departments' });
      expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: b.approval.approval_id } })).status).toBe('APPROVED');
    });

    it('with no local model the task is blocked without using its approval; resume then lets it run', async () => {
      vi.stubEnv('DEFAULT_MODEL', ''); vi.stubEnv('SWARM_MODEL', '');
      const b = task();
      const t = await (await post(b)).json();
      const jobKey = `marcus:${b.client_operation_id}`;
      await tick(jobKey);
      expect(await job(t.task_id)).toMatchObject({ lastStatus: 'blocked', lastError: 'model_or_budget_unavailable' });
      expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: b.approval.approval_id } })).status).toBe('APPROVED');

      vi.stubEnv('DEFAULT_MODEL', 'existing-local-model'); vi.stubEnv('SWARM_MODEL', 'existing-local-model');
      expect((await tasks.resumeMarcusTask(owner, t.task_id)).status).toBe(200);
      await tick(jobKey);
      expect((await job(t.task_id)).lastStatus).toBe('in_progress');
    });

    it('a financial task runs only after its second approval', async () => {
      const b = task({ sensitivity: 'financial' });
      const t = await (await post(b)).json();
      const jobKey = `marcus:${b.client_operation_id}`;
      expect(await parked(t.task_id)).toBe(true); // waiting for the second approval: not claimable
      const second = { approval_id: `appr-${randomUUID()}`, approved_at: '2026-11-14T00:01:00Z', method: 'voice', content_hash: b.approval.content_hash };
      expect((await tasks.confirmMarcusTask(owner, t.task_id, second)).status).toBe(200);
      expect(await tick(jobKey)).toBe('OK');
      expect((await job(t.task_id)).lastStatus).toBe('in_progress');
    });

    it('freezing a running task cancels its analysis; unfreezing marks it cancelled instead of re-running a used approval', async () => {
      const b = task();
      const t = await (await post(b)).json();
      const jobKey = `marcus:${b.client_operation_id}`;
      await tick(jobKey);
      const executionId = (await job(t.task_id)).capabilityReceiptId!;
      expect(await freeze.setMarcusFreeze(owner, true)).toContain(t.task_id);
      expect((await prisma.agentExecution.findUniqueOrThrow({ where: { id: executionId } })).status).toBe('CANCELLED');
      expect((await job(t.task_id)).lastStatus).toBe('frozen');
      expect(await parked(t.task_id)).toBe(true); // frozen jobs are not claimable
      await freeze.setMarcusFreeze(owner, false);
      expect((await job(t.task_id)).lastStatus).toBe('cancelled');
    });

    it('a frozen task that never started is re-queued on unfreeze and then runs', async () => {
      const b = task();
      const t = await (await post(b)).json();
      await freeze.setMarcusFreeze(owner, true);
      await freeze.setMarcusFreeze(owner, false);
      expect((await job(t.task_id)).lastStatus).toBe('received');
      expect(await tick(`marcus:${b.client_operation_id}`)).toBe('OK');
      expect((await job(t.task_id)).lastStatus).toBe('in_progress');
    });

    it('content altered after approval is refused before anything is consumed', async () => {
      const b = task();
      const t = await (await post(b)).json();
      await prisma.agentJob.update({ where: { id: t.task_id }, data: { capabilityRequestHash: 'f'.repeat(64) } });
      await tick(`marcus:${b.client_operation_id}`);
      expect(await job(t.task_id)).toMatchObject({ lastStatus: 'failed', lastError: 'content_changed' });
      expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: b.approval.approval_id } })).status).toBe('APPROVED');
    });
  });
});

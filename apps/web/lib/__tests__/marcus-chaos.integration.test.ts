/** Real Postgres: a worker that dies at each step of a Marcus run causes no double execution and no stuck job. Opt in with M1_EXECUTION_DATABASE_URL (a disposable *test* database). */
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
import { runClaimedJob } from '@/lib/worker/runner';

const enabled = !!process.env.M1_EXECUTION_DATABASE_URL;
const TOKEN = `tok-${randomUUID()}`;
let owner = '';
let intake: typeof import('@/lib/marcus/intake').intakeMarcusTask;
const reply = JSON.stringify({ result: 'Internal draft.', learnings: [], confidence: 0.6 });

async function submit() {
  const b = { client_operation_id: `op-${randomUUID()}`, title: 'Summarise the product roadmap', goal: 'Summarise Q4 product roadmap risks and milestones', deadline: null, requested_for: 'victor', sensitivity: 'standard', directorate: null };
  const content_hash = createHash('sha256').update(canonicalJson({ title: b.title, goal: b.goal, deadline: b.deadline })).digest('hex');
  const res = await intake(new Request('http://x/api/integrations/marcus/tasks', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ ...b, approval: { approval_id: `appr-${randomUUID()}`, approved_at: '2026-11-14T00:00:00Z', method: 'voice', content_hash } }) }));
  const out = await res.json();
  return { taskId: out.task_id as string, jobKey: `marcus:${b.client_operation_id}` };
}
/** Lease the job to `worker` and run it through the worker's own dispatch. A killed worker is a lease that is never released. */
async function tick(jobKey: string, worker: string) {
  const row = await prisma.agentJob.findFirstOrThrow({ where: { userId: owner, jobKey } });
  const leaseUntil = new Date(Date.now() + 600_000);
  await prisma.agentJob.update({ where: { id: row.id }, data: { leaseOwner: worker, leaseUntil } });
  return runClaimedJob({ id: row.id, jobKey, userId: owner, consecutiveFailures: row.consecutiveFailures, runs: row.runs, leaseUntil }, worker);
}
const kill = (jobKey: string, worker: string) => prisma.agentJob.updateMany({ where: { userId: owner, jobKey }, data: { leaseOwner: worker, leaseUntil: new Date(Date.now() - 1000) } });
const parked = async (id: string) => (await prisma.agentJob.findUniqueOrThrow({ where: { id } })).nextRunAt.getTime() > Date.now() + 365 * 24 * 3600_000;

describe.skipIf(!enabled)('marcus worker-kill chaos', () => {
  beforeAll(async () => {
    if (process.env.M1_EXECUTION_DATABASE_URL !== process.env.DATABASE_URL || !/test/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error('Isolated test database required');
    const email = `marcus-chaos-${randomUUID()}@example.test`;
    owner = (await prisma.user.create({ data: { email } })).id;
    vi.stubEnv('WHINK_OWNER_EMAILS', email);
    vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32));
    vi.stubEnv('MARCUS_BEARER_TOKEN_HASH', createHash('sha256').update(TOKEN).digest('hex'));
    ({ intakeMarcusTask: intake } = await import('@/lib/marcus/intake'));
  });
  afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); });
  beforeEach(() => {
    vi.stubEnv('DEFAULT_MODEL', 'existing-local-model');
    vi.stubEnv('SWARM_MODEL', 'existing-local-model');
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'http://127.0.0.1:11434/v1');
    model.call.mockReset().mockResolvedValue(reply);
    model.admission.mockReset().mockResolvedValue(true);
  });

  it('killed after the execution was queued but before the job moved on: the next worker adopts it, one execution, one run', async () => {
    const { taskId, jobKey } = await submit();
    const before = await prisma.agentJob.findUniqueOrThrow({ where: { id: taskId } });
    expect(await tick(jobKey, 'dead-1')).toBe('OK');
    const exec = (await prisma.agentJob.findUniqueOrThrow({ where: { id: taskId } })).capabilityReceiptId!;
    // Rewind the job to what the database held when the worker died: approval consumed, execution queued, job still 'received'.
    await prisma.agentJob.update({ where: { id: taskId }, data: { lastStatus: 'received', capabilityReceiptId: null, capabilityRequestEnc: before.capabilityRequestEnc, nextRunAt: new Date() } });
    await kill(jobKey, 'dead-1');
    expect(await tick(jobKey, 'live-2')).toBe('OK');
    const after = await prisma.agentJob.findUniqueOrThrow({ where: { id: taskId } });
    expect(after).toMatchObject({ lastStatus: 'in_progress', capabilityReceiptId: exec });
    expect(await prisma.agentExecution.count({ where: { userId: owner, approval: { correlationId: { startsWith: `${jobKey}#` } } } })).toBe(1);
    expect(await prisma.agentJob.count({ where: { userId: owner, jobKey: `ear:${exec}` } })).toBe(1);
  });

  it('killed after the EAR approval row but before queueing: the next worker queues it once', async () => {
    const { taskId, jobKey } = await submit();
    const before = await prisma.agentJob.findUniqueOrThrow({ where: { id: taskId } });
    await tick(jobKey, 'dead-1');
    const exec = (await prisma.agentJob.findUniqueOrThrow({ where: { id: taskId } })).capabilityReceiptId!;
    const ex = await prisma.agentExecution.findUniqueOrThrow({ where: { id: exec } });
    await prisma.agentJob.deleteMany({ where: { userId: owner, jobKey: `ear:${exec}` } });
    await prisma.sealedScope.deleteMany({ where: { kind: 'EXECUTION', refId: exec } });
    await prisma.agentExecution.delete({ where: { id: exec } });
    await prisma.approvalRequest.update({ where: { id: ex.approvalId }, data: { status: 'EXECUTING', executedAt: null, result: undefined } });
    await prisma.agentJob.update({ where: { id: taskId }, data: { lastStatus: 'received', capabilityReceiptId: null, capabilityRequestEnc: before.capabilityRequestEnc, nextRunAt: new Date() } });
    await kill(jobKey, 'dead-1');
    expect(await tick(jobKey, 'live-2')).toBe('OK');
    expect(await prisma.agentExecution.count({ where: { approvalId: ex.approvalId } })).toBe(1);
    expect((await prisma.agentJob.findUniqueOrThrow({ where: { id: taskId } })).lastStatus).toBe('in_progress');
  });

  it('killed while the analysis was RUNNING: the lease lapses, the next worker finishes it once, the task ends done and parks', async () => {
    const { taskId, jobKey } = await submit();
    await tick(jobKey, 'w1');
    const exec = (await prisma.agentJob.findUniqueOrThrow({ where: { id: taskId } })).capabilityReceiptId!;
    const agents = (await prisma.agentExecution.findUniqueOrThrow({ where: { id: exec } })).agentIds.length;
    // The first worker claimed and started the run, then died holding its lease.
    await prisma.agentExecution.update({ where: { id: exec }, data: { status: 'RUNNING', attempts: 1, claimToken: 'dead-1:token' } });
    await kill(`ear:${exec}`, 'dead-1');
    expect(await tick(`ear:${exec}`, 'live-2')).toBe('OK');
    expect(await prisma.agentExecution.findUniqueOrThrow({ where: { id: exec } })).toMatchObject({ status: 'SUCCEEDED', attempts: 2 });
    expect(model.call).toHaveBeenCalledTimes(agents); // the dead worker never finished a call, so each specialist ran once
    expect(await tick(`ear:${exec}`, 'live-3')).toBe('SKIPPED'); // a third worker finds it terminal and does nothing
    expect(model.call).toHaveBeenCalledTimes(agents);

    await prisma.agentJob.update({ where: { id: taskId }, data: { nextRunAt: new Date() } });
    await tick(jobKey, 'live-2');
    expect((await prisma.agentJob.findUniqueOrThrow({ where: { id: taskId } })).lastStatus).toBe('done');
    expect(await parked(taskId)).toBe(true);
    expect(await prisma.action.count({ where: { userId: owner, correlationId: `marcus-task:${taskId}`, action: 'capability_marcus_task_done' } })).toBe(1);
  });

  it('two workers racing to admit the same task queue exactly one execution', async () => {
    const { taskId, jobKey } = await submit();
    const row = await prisma.agentJob.findUniqueOrThrow({ where: { id: taskId } });
    const lease = new Date(Date.now() + 600_000);
    await prisma.agentJob.update({ where: { id: taskId }, data: { leaseOwner: 'a', leaseUntil: lease } });
    const claimed = { id: taskId, jobKey, userId: owner, consecutiveFailures: row.consecutiveFailures, runs: row.runs, leaseUntil: lease };
    await Promise.all([runClaimedJob(claimed, 'a'), runClaimedJob(claimed, 'b')]);
    expect(await prisma.agentExecution.count({ where: { userId: owner, approval: { correlationId: { startsWith: `${jobKey}#` } } } })).toBe(1);
  });
});

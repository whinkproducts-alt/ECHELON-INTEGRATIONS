/** Real Postgres approvals/queue/leases/audit. Only inference is mocked: no paid/live model calls.
 * Opt in using M1_EXECUTION_DATABASE_URL and matching DATABASE_URL ending in a test DB.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
const model = vi.hoisted(() => ({ call: vi.fn(), admission: vi.fn() }));
vi.mock('@/lib/model-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/model-router')>(), chatOnce: model.call, verifyLocalAnalysisModel: model.admission,
}));
import { reserveLocalAnalysis, settleLocalAnalysis } from '@/lib/model-router/reservations';
import { budgetState } from '@/lib/budget';
import { prisma } from '@/lib/db';
import { createApproval, decide } from '@/lib/approvals';
import { admittedAgents, analysisRoute, cancelExecution, runEarJob } from '@/lib/worker/ear-execution';
import { claimDueJobs, type ClaimedJob } from '@/lib/worker/scheduler';
import { runClaimedJob } from '@/lib/worker/runner';
import { getOrgKit } from '@/lib/agent-loader';
import type { ExecutionAuthorizationRequest } from '@whink/org-kit';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import * as permission from '@/lib/permission-engine';

const enabled = !!process.env.M1_EXECUTION_DATABASE_URL;
let userId = '';
let otherId = '';
let ear: ExecutionAuthorizationRequest;
const reply = JSON.stringify({ result: 'Internal draft: verify source evidence before external action.', learnings: [], confidence: 0.6 });

async function queued() {
  const a = await createApproval({ userId, kind: 'ear', params: ear, correlationId: 'm1-test' });
  const out = await decide(userId, a.id, 'approve');
  expect(out.status).toBe('EXECUTED');
  const receipt = out.result!.data as { executionId: string; status: string };
  expect(receipt.status).toBe('QUEUED');
  return { approvalId: a.id, id: receipt.executionId };
}
async function claim(id: string, worker = 'm1-worker'): Promise<ClaimedJob> {
  const rows = await claimDueJobs(worker, 100);
  const job = rows.find((j) => j.jobKey === `ear:${id}`);
  expect(job).toBeDefined();
  return job!;
}
async function row(id: string) { return prisma.agentExecution.findFirstOrThrow({ where: { id, userId } }); }

describe.skipIf(!enabled)('M1 real database execution', () => {
  beforeAll(async () => {
    const url = process.env.M1_EXECUTION_DATABASE_URL!;
    if (url !== process.env.DATABASE_URL || !/test/.test(new URL(url).pathname)) throw new Error('Explicit isolated test database required');
    await prisma.agentExecution.count(); // migration is mandatory; never silently skip connection failures
    userId = (await prisma.user.create({ data: { email: `m1-a-${Date.now()}@example.test` } })).id;
    otherId = (await prisma.user.create({ data: { email: `m1-b-${Date.now()}@example.test` } })).id;
    const kit = await getOrgKit();
    const agent = kit.agents[0];
    ear = { execution_scope: 'internal_analysis', status: 'AWAITING_HUMAN_APPROVAL', objective: 'Draft an internal summary of the supplied project plan', owning_directorate: agent.directorate, owning_department: agent.department, lead_agent: agent.name, supporting_agents: [], team_size: 1, why_sufficient: 'Internal draft', required_skills: [agent.skills[0]], capability_gaps: [], schedule: 'Once', milestones: [], estimated_budget: 'No paid calls', assumptions: [], risks: [], approval_required: true, execution_allowed: false };
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('DEFAULT_MODEL', 'existing-local-model');
    vi.stubEnv('SWARM_MODEL', 'existing-local-model');
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'http://127.0.0.1:11434/v1');
    model.call.mockReset().mockResolvedValue(reply);
    model.admission.mockReset().mockResolvedValue(true);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (userId) {
      await prisma.action.deleteMany({ where: { userId: { in: [userId, otherId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    }
    await prisma.$disconnect();
  });

  it('concurrent local attempts cannot both take the last capacity; settlement is scoped and single-use', async () => {
    await prisma.userPreference.upsert({ where: { userId: otherId }, create: { userId: otherId, monthlyTokenBudget: 100 }, update: { monthlyTokenBudget: 100 } });
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => reserveLocalAnalysis(otherId, 'local', 75)));
    const winners = attempts.flatMap(a => a.status === 'fulfilled' ? [a.value] : []);
    expect(winners).toHaveLength(1);
    expect(await budgetState(otherId)).toMatchObject({ used: 0, reserved: 75 });
    const id = winners[0].id;
    await expect(settleLocalAnalysis(userId, id, 'local', 5, 10)).rejects.toThrow('BLOCKED_COST');
    await settleLocalAnalysis(otherId, id, 'local', 5, 10);
    await expect(settleLocalAnalysis(otherId, id, 'local', 5, 10)).rejects.toThrow('BLOCKED_COST');
    expect(await budgetState(otherId)).toMatchObject({ used: 15, reserved: 0 });
  });

  it('persists queue admission, actual worker result, lifecycle and audit, never simulated dispatch', async () => {
    const q = await queued();
    expect(model.call).not.toHaveBeenCalled();
    const job = await claim(q.id);
    expect(await runClaimedJob(job, 'm1-worker')).toBe('OK');
    expect(model.call).toHaveBeenCalledTimes(1);
    expect((await row(q.id)).status).toBe('SUCCEEDED');
    expect(JSON.stringify((await row(q.id)).output)).toContain('Internal draft');
    const events = await prisma.action.findMany({ where: { userId, validationResult: { contains: q.id } }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.validationResult).join(' ')).toMatch(/QUEUED.*CLAIMED.*RUNNING.*SUCCEEDED/);
    expect(JSON.stringify(events)).not.toContain('TEAM DISPATCHED');
    expect(await prisma.usageEvent.count({ where: { userId, provider: 'local-analysis' } })).toBeGreaterThan(0);
    expect((await claimDueJobs('again', 100)).some((j) => j.id === job.id)).toBe(false);
  });

  it('ten simultaneous approval callbacks produce one durable execution/job', async () => {
    const a = await createApproval({ userId, kind: 'ear', params: ear, correlationId: 'concurrent' });
    const results = await Promise.all(Array.from({ length: 10 }, () => decide(userId, a.id, 'approve')));
    expect(results.filter((r) => r.status === 'EXECUTED')).toHaveLength(1);
    const executions = await prisma.agentExecution.findMany({ where: { userId, approvalId: a.id } });
    expect(executions).toHaveLength(1);
    expect(await prisma.agentJob.count({ where: { userId, jobKey: `ear:${executions[0].id}` } })).toBe(1);
    await cancelExecution(userId, executions[0].id);
  });

  it('denied, expired, other-account and tampered approvals enqueue nothing', async () => {
    const a = await createApproval({ userId, kind: 'ear', params: ear, correlationId: 'denied' });
    expect((await decide(otherId, a.id, 'approve')).status).toBe('NOT_FOUND');
    expect((await decide(userId, a.id, 'deny')).status).toBe('DENIED');
    expect((await decide(userId, a.id, 'approve')).status).toBe('ALREADY_DECIDED');
    const expired = await createApproval({ userId, kind: 'ear', params: ear, correlationId: 'expired', now: () => new Date(Date.now() - 60_000) });
    expect((await decide(userId, expired.id, 'approve')).status).toBe('EXPIRED');
    const tampered = await createApproval({ userId, kind: 'ear', params: ear, correlationId: 'tampered' });
    await prisma.approvalRequest.update({ where: { id: tampered.id }, data: { params: { ...ear, objective: 'changed' } } });
    expect((await decide(userId, tampered.id, 'approve')).status).toBe('FAILED');
    expect(await prisma.agentExecution.count({ where: { approvalId: { in: [a.id, expired.id, tampered.id] } } })).toBe(0);
    expect(model.call).not.toHaveBeenCalled();
  });

  it('blocks cloud cost and changed content at execution boundaries', async () => {
    const q = await queued();
    vi.stubEnv('SWARM_MODEL', 'claude-needs-paid-admission');
    await runEarJob(await claim(q.id), 'm1-worker');
    expect((await row(q.id)).status).toBe('BLOCKED_COST');
    expect(model.call).not.toHaveBeenCalled();
    vi.stubEnv('SWARM_MODEL', 'existing-local-model');
    const changed = await queued();
    await prisma.approvalRequest.update({ where: { id: changed.approvalId }, data: { params: { ...ear, objective: 'changed after admission' } } });
    await runEarJob(await claim(changed.id), 'm1-worker');
    expect((await row(changed.id)).status).toBe('BLOCKED_POLICY');
    expect(model.call).not.toHaveBeenCalled();
  });

  it('permission-engine refusal at the worker boundary runs no inference', async () => {
    const q = await queued();
    vi.spyOn(permission, 'checkQueuedEar').mockResolvedValue({ allowed: false, method: 'requires_confirmation', reason: 'refused' });
    await runEarJob(await claim(q.id), 'm1-worker');
    expect((await row(q.id)).status).toBe('BLOCKED_POLICY');
    expect(model.call).not.toHaveBeenCalled();
  });

  it('missing local weight evidence blocks inference; unavailable accounting never retries unmetered work', async () => {
    const missing = await queued();
    model.admission.mockResolvedValueOnce(false);
    await runEarJob(await claim(missing.id), 'm1-worker');
    expect((await row(missing.id)).status).toBe('BLOCKED_COST');
    expect(model.call).not.toHaveBeenCalled();
    const q = await queued();
    vi.spyOn(prisma.usageEvent, 'updateMany').mockRejectedValueOnce(new Error('meter unavailable'));
    const job = await claim(q.id);
    await runEarJob(job, 'm1-worker');
    expect((await row(q.id)).status).toBe('BLOCKED_COST');
    await runEarJob(job, 'm1-worker');
    expect(model.call).toHaveBeenCalledTimes(1);
    expect(analysisRoute({ DEFAULT_MODEL: 'gpt-4o', OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:4000/v1' })).toBeNull();
  });

  it('a timely decision survives queue delay; canonical agents collaborate only inside approved analysis', async () => {
    const kit = await getOrgKit();
    const team = { ...ear, supporting_agents: [kit.agents[1].name], team_size: 2, required_skills: [...new Set([...ear.required_skills, kit.agents[1].skills[0]])] };
    const a = await createApproval({ userId, kind: 'ear', params: team, correlationId: 'team' });
    const result = await decide(userId, a.id, 'approve');
    const id = (result.result!.data as { executionId: string }).executionId;
    // Decision was timely; queue delay does not mint or widen the authorization.
    const past = new Date(Date.now() - 60_000);
    await prisma.approvalRequest.update({ where: { id: a.id }, data: { decidedAt: new Date(past.getTime() - 1000), expiresAt: past } });
    expect(await runEarJob(await claim(id), 'm1-worker')).toBe('OK');
    expect(model.call).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(model.call.mock.calls[1][0].messages)).toContain('swarm_dependency_output');
    expect(JSON.stringify(model.call.mock.calls[0][0].messages)).toContain(kit.agents[0].name);
    expect((await row(id)).agentIds).toEqual([kit.agents[0].agent_id, kit.agents[1].agent_id]);
  });

  it('cancellation is owner-scoped and prevents queued execution', async () => {
    const q = await queued();
    expect(await cancelExecution(otherId, q.id)).toBe(false);
    expect(await cancelExecution(userId, q.id)).toBe(true);
    expect((await row(q.id)).status).toBe('CANCELLED');
    expect((await claimDueJobs('none', 100)).some((j) => j.jobKey === `ear:${q.id}`)).toBe(false);
    expect(model.call).not.toHaveBeenCalled();
  });

  it('cancellation aborts active inference and rejects a late result', async () => {
    const q = await queued();
    let start!: () => void;
    const started = new Promise<void>((r) => { start = r; });
    model.call.mockImplementationOnce(({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); start();
    }));
    const job = await claim(q.id);
    const running = runEarJob(job, 'm1-worker');
    await started;
    expect(await cancelExecution(userId, q.id)).toBe(true);
    await running;
    expect((await row(q.id)).status).toBe('CANCELLED');
    expect((await row(q.id)).output).toBeNull();
  });

  it('duplicate worker invocation cannot start a second attempt on the same claim', async () => {
    const q = await queued();
    const job = await claim(q.id);
    const outcomes = await Promise.all([runEarJob(job, 'm1-worker'), runEarJob(job, 'm1-worker')]);
    expect(outcomes).toContain('OK');
    expect(model.call).toHaveBeenCalledTimes(1);
    expect((await row(q.id)).attempts).toBe(1);
  });

  it('recovers an expired claim, fences the old worker, and never replays terminal work', async () => {
    const q = await queued();
    const old = await claim(q.id, 'dead-worker');
    await prisma.agentJob.update({ where: { id: old.id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
    await prisma.agentExecution.update({ where: { id: q.id }, data: { status: 'RUNNING', attempts: 1, claimToken: `dead-worker:${old.leaseUntil!.toISOString()}` } });
    const recovered = await claim(q.id, 'new-worker');
    expect(await runEarJob(old, 'dead-worker')).toBe('SKIPPED');
    expect(await runEarJob(recovered, 'new-worker')).toBe('OK');
    expect((await row(q.id)).attempts).toBe(2);
    expect(await runEarJob(old, 'dead-worker')).toBe('SKIPPED');
    expect(model.call).toHaveBeenCalledTimes(1);
  });

  it('retries harmless failures finitely, then persists FAILED', async () => {
    const q = await queued();
    model.call.mockRejectedValue(new Error('local endpoint unavailable'));
    for (let i = 0; i < 3; i++) {
      await prisma.agentJob.updateMany({ where: { userId, jobKey: `ear:${q.id}` }, data: { nextRunAt: new Date() } });
      await runEarJob(await claim(q.id), 'm1-worker');
      expect((await row(q.id)).status).toBe(i < 2 ? 'RETRY_SCHEDULED' : 'FAILED');
    }
    expect(model.call).toHaveBeenCalledTimes(3);
    expect((await row(q.id)).attempts).toBe(3);
  });

  it('preserves roster counts/bytes and denies private, retired, suspended and unknown assignees', async () => {
    const kit = await getOrgKit();
    expect(kit.agents).toHaveLength(326); expect(kit.teams).toHaveLength(163);
    expect(new Set(kit.agents.map((a) => a.directorate)).size).toBe(15);
    const original = kit.agents[0];
    for (const state of ['suspended', 'retired'] as const) expect(() => admittedAgents(ear, [{ ...original, state }])).toThrow();
    for (const label of ['founder_sealed', 'founder_private', 'kill_team']) expect(() => admittedAgents(ear, [{ ...original, data_access: [label] }])).toThrow();
    expect(() => admittedAgents({ ...ear, lead_agent: 'Marcus Vale' }, kit.agents)).toThrow();
    expect(() => admittedAgents({ ...ear, lead_agent: 'invented agent' }, kit.agents)).toThrow();
    for (const f of ['organization/workforce_registry.json', 'organization/team_registry.json']) {
      const bytes = readFileSync(path.join(kit.root, f));
      const hash = createHash('sha256').update(bytes).digest('hex');
      expect(hash).toBe(ROSTER_HASHES[f]);
    }
    expect(analysisRoute({ SWARM_MODEL: 'gemini-cloud' })).toBeNull();
    expect(analysisRoute({ DEFAULT_MODEL: 'local', OPENAI_COMPATIBLE_BASE_URL: 'https://remote.example/v1' })).toBeNull();
  });
});
const ROSTER_HASHES: Record<string, string> = {
  'organization/workforce_registry.json': '41ffcb3933b680784df003fe81e98b1f1b5bccec78e5d79c72141661052df3f8',
  'organization/team_registry.json': '5613dc63caf7531fbcdaa38094ad6af1ccdee5790d86bd3f4e455f2c8188d95d',
};

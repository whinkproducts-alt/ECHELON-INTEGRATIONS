/**
 * Real Postgres and a REAL local model. No stubs: intake, executor, EAR worker and Ollama.
 * Opt in with M1_EXECUTION_DATABASE_URL=$DATABASE_URL (disposable *test* database) and OLLAMA_INTEGRATION_MODEL=<installed tag>.
 * Not a quality benchmark: it proves the wiring works with real inference.
 */
import { randomUUID, createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
vi.unmock('@/lib/safety/lockdown');
import { prisma } from '@/lib/db';
import { canonicalJson } from '@/lib/canonical-json';
import { runClaimedJob } from '@/lib/worker/runner';

const enabled = !!process.env.M1_EXECUTION_DATABASE_URL && !!process.env.OLLAMA_INTEGRATION_MODEL;
const TOKEN = `tok-${randomUUID()}`;
const worker = `marcus-ollama-${randomUUID()}`;
let owner = '';
let intake: typeof import('@/lib/marcus/intake').intakeMarcusTask;
let tasks: typeof import('@/lib/marcus/tasks');

async function tick(jobKey: string) {
  const row = await prisma.agentJob.findFirstOrThrow({ where: { userId: owner, jobKey } });
  const leaseUntil = new Date(Date.now() + 600_000);
  await prisma.agentJob.update({ where: { id: row.id }, data: { leaseOwner: worker, leaseUntil } });
  return runClaimedJob({ id: row.id, jobKey, userId: owner, consecutiveFailures: row.consecutiveFailures, runs: row.runs, leaseUntil }, worker);
}

describe.skipIf(!enabled)('marcus task with a real local model', () => {
  beforeAll(async () => {
    if (process.env.M1_EXECUTION_DATABASE_URL !== process.env.DATABASE_URL || !/test/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error('Isolated test database required');
    const email = `marcus-ollama-${randomUUID()}@example.test`;
    owner = (await prisma.user.create({ data: { email } })).id;
    vi.stubEnv('WHINK_OWNER_EMAILS', email);
    vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32));
    vi.stubEnv('MARCUS_BEARER_TOKEN_HASH', createHash('sha256').update(TOKEN).digest('hex'));
    vi.stubEnv('DEFAULT_MODEL', process.env.OLLAMA_INTEGRATION_MODEL!);
    vi.stubEnv('SWARM_MODEL', process.env.OLLAMA_INTEGRATION_MODEL!);
    ({ intakeMarcusTask: intake } = await import('@/lib/marcus/intake'));
    tasks = await import('@/lib/marcus/tasks');
  });
  afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); });

  it('runs a spoken-style task to done with real inference and returns the result', async () => {
    const title = 'Summarise the product roadmap';
    const goal = 'Summarise the main risks to a Q4 product roadmap and what to watch each month';
    const content_hash = createHash('sha256').update(canonicalJson({ title, goal, deadline: null })).digest('hex');
    const res = await intake(new Request('http://x/api/integrations/marcus/tasks', {
      method: 'POST', headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ client_operation_id: `op-${randomUUID()}`, title, goal, deadline: null, requested_for: 'victor', sensitivity: 'standard', directorate: null, approval: { approval_id: `appr-${randomUUID()}`, approved_at: '2026-11-15T00:00:00Z', method: 'voice', content_hash } }),
    }));
    expect(res.status).toBe(200);
    const t = await res.json();
    const jobKey = `marcus:${(await prisma.agentJob.findUniqueOrThrow({ where: { id: t.task_id } })).jobKey.slice(7)}`;

    expect(await tick(jobKey)).toBe('OK');
    const started = await prisma.agentJob.findUniqueOrThrow({ where: { id: t.task_id } });
    expect(started.lastStatus, `admission ended ${started.lastStatus} (${started.lastError})`).toBe('in_progress');

    const t0 = Date.now();
    expect(await tick(`ear:${started.capabilityReceiptId}`)).toBe('OK');
    const ex = await prisma.agentExecution.findUniqueOrThrow({ where: { id: started.capabilityReceiptId! } });
    console.log(`analysis: ${ex.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s, agents=${ex.agentIds.length}, attempts=${ex.attempts}, reason=${ex.reason ?? '-'}`);
    expect(ex.status, `execution ended ${ex.status} (${ex.reason})`).toBe('SUCCEEDED');

    await prisma.agentJob.update({ where: { id: t.task_id }, data: { nextRunAt: new Date() } });
    await tick(jobKey);
    const got = await tasks.getMarcusTask(owner, t.task_id);
    expect(got.body.status).toBe('done');
    const outputs = (got.body.result as { outputs: Array<{ agent_id: string; text: string }> }).outputs;
    expect(outputs.length).toBeGreaterThan(0);
    for (const o of outputs) console.log(`--- ${o.agent_id}\n${o.text.slice(0, 700)}`);
    expect(outputs.every((o) => o.text.trim().length > 20)).toBe(true);
  }, 900_000);
});

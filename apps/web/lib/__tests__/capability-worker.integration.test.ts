/** Real database, queue, worker runner, permission engine, ledger and MCP sockets. No inference. */
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
import { prisma } from '@/lib/db';
import { getOrgKit } from '@/lib/agent-loader';
import { enqueueCapabilityJob, getCapabilityJob, CAPABILITY_QUEUE_TTL_MS } from '@/lib/worker/capability-execution';
import { claimDueJobs } from '@/lib/worker/scheduler';
import { runClaimedJob } from '@/lib/worker/runner';
import { registerProvider, discoverProvider, reviewProvider, enableProvider, createGrant, revokeGrant, disableProvider } from '@/lib/capability/providers';
import { decide } from '@/lib/approvals';
import { encryptKey } from '@/lib/key-encryption';
import * as ledger from '@/lib/ledger';
import { startMockMcp, type MockMcp } from './helpers/mock-mcp-server';

let owner = '', other = '', agentId = '', server: MockMcp;
const enabled = !!process.env.M1_EXECUTION_DATABASE_URL;
const worker = `cap-worker-${randomUUID()}`;
async function fixture(riskClass: 'A' | 'C' = 'A', grant = true, mcp = server) {
  const provider = await registerProvider(owner, { connectorId: `w-${randomUUID().slice(0, 12)}`, transport: 'streamable-http', endpoint: mcp.url });
  await discoverProvider(owner, provider.id);
  const tool = await prisma.tool.findFirstOrThrow({ where: { connectorInstallId: provider.id } });
  await reviewProvider(owner, provider.id, { tools: [{ toolId: tool.id, riskClass, costClass: 'FREE' }] });
  await enableProvider(owner, provider.id);
  const permission = grant ? await createGrant(owner, { subjectType: 'AGENT', subjectId: agentId, toolId: tool.id }) : null;
  const request = { requestId: randomUUID(), agentId, toolName: tool.name, args: { text: 'worker-payload' }, dataClass: 'organization' as const };
  return { provider, tool, permission, request };
}
async function claim(id: string) {
  const claimed = await claimDueJobs(worker, 1000);
  const job = claimed.find((j) => j.id === id);
  expect(job).toBeDefined();
  return job!;
}

describe.skipIf(!enabled)('capability worker real integration', () => {
  beforeAll(async () => {
    if (process.env.M1_EXECUTION_DATABASE_URL !== process.env.DATABASE_URL || !/test/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error('Isolated test database required');
    vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32));
    owner = (await prisma.user.create({ data: { email: `worker-${randomUUID()}@example.test` } })).id;
    other = (await prisma.user.create({ data: { email: `other-${randomUUID()}@example.test` } })).id;
    agentId = (await getOrgKit()).agents[0].agent_id;
    server = await startMockMcp();
  });
  afterAll(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs();
    await server?.close();
    // Keep receipts as evidence; test accounts are isolated from the browser fixture.
    await prisma.$disconnect();
  });
  it('claims a real queued job, dispatches through the runner and records a linked receipt without payload leakage', async () => {
    const f = await fixture();
    const before = server.calls.length;
    const q = await enqueueCapabilityJob(owner, f.request);
    expect(server.calls.length).toBe(before);
    expect(JSON.stringify(q)).not.toContain('worker-payload');
    const stored = await prisma.agentJob.findUniqueOrThrow({ where: { id: q.id } });
    expect(stored.capabilityRequestEnc).toBeTruthy();
    expect(stored.capabilityRequestEnc).not.toContain('worker-payload');
    expect(await runClaimedJob(await claim(q.id), worker)).toBe('OK');
    expect(server.calls.length).toBe(before + 1);
    const view = await getCapabilityJob(owner, q.id);
    expect(view?.lastStatus).toBe('EXECUTED');
    expect(view?.untrusted).toBe(true);
    expect(view?.result).toContain('echo: worker-payload');
    const receipt = await prisma.action.findFirstOrThrow({ where: { id: view!.capabilityReceiptId!, userId: owner } });
    expect(receipt).toMatchObject({ correlationId: q.id, status: 'EXECUTED', initiator: 'automation', grantId: f.permission!.id });
    expect(JSON.stringify(receipt)).not.toContain('worker-payload');
    const finished = await prisma.agentJob.findUniqueOrThrow({ where: { id: q.id } });
    expect(finished.capabilityRequestEnc).toBeNull();
    expect(finished.capabilityResultEnc).toBeTruthy();
    expect(finished.capabilityResultEnc).not.toContain('worker-payload');
  });
  it('deduplicates concurrent submissions and duplicate worker dispatches; rejects changed content under the same request id', async () => {
    const f = await fixture();
    const rows = await Promise.all(Array.from({ length: 5 }, () => enqueueCapabilityJob(owner, f.request)));
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    await expect(enqueueCapabilityJob(owner, { ...f.request, args: { text: 'different' } })).rejects.toThrow('different content');
    const j = await claim(rows[0].id); const before = server.calls.length;
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => runClaimedJob(j, worker)));
    expect(outcomes.filter((o) => o === 'OK')).toHaveLength(1);
    expect(server.calls.length).toBe(before + 1);
    expect((await claimDueJobs(worker, 1000)).some((r) => r.id === j.id)).toBe(false);
  });
  it('denies a queued agent with no grant, sending zero tool calls', async () => {
    const f = await fixture('A', false); const q = await enqueueCapabilityJob(owner, f.request);
    const before = server.calls.length;
    expect(await runClaimedJob(await claim(q.id), worker)).toBe('FAILED');
    expect(server.calls.length).toBe(before);
    expect((await getCapabilityJob(owner, q.id))?.lastError).toBe('AUTHZ_POLICY_DENIED');
  });
  it('rechecks revocation and provider disable after queue admission', async () => {
    for (const mode of ['grant', 'provider']) {
      const f = await fixture(); const q = await enqueueCapabilityJob(owner, f.request);
      if (mode === 'grant') await revokeGrant(owner, f.permission!.id); else await disableProvider(owner, f.provider.id);
      const before = server.calls.length;
      expect(await runClaimedJob(await claim(q.id), worker)).toBe('FAILED');
      expect(server.calls.length).toBe(before);
    }
  });
  it('Class C waits for the existing approval, executes only once after approval, and reports its disposition separately', async () => {
    const f = await fixture('C'); const q = await enqueueCapabilityJob(owner, f.request);
    const before = server.calls.length;
    expect(await runClaimedJob(await claim(q.id), worker)).toBe('SKIPPED');
    expect(server.calls.length).toBe(before);
    const waiting = await getCapabilityJob(owner, q.id);
    expect(waiting?.lastStatus).toBe('AWAITING_APPROVAL');
    expect(waiting?.approvalStatus).toBe('PENDING');
    expect((await decide(owner, waiting!.capabilityApprovalId!, 'approve')).status).toBe('EXECUTED');
    expect((await decide(owner, waiting!.capabilityApprovalId!, 'approve')).status).toBe('ALREADY_DECIDED');
    expect(server.calls.length).toBe(before + 1);
    expect((await getCapabilityJob(owner, q.id))?.approvalStatus).toBe('EXECUTED');
  });
  it('revocation during the approval window prevents execution', async () => {
    const f = await fixture('C'); const q = await enqueueCapabilityJob(owner, f.request);
    await runClaimedJob(await claim(q.id), worker);
    const view = await getCapabilityJob(owner, q.id); await revokeGrant(owner, f.permission!.id);
    const before = server.calls.length;
    expect((await decide(owner, view!.capabilityApprovalId!, 'approve')).status).toBe('FAILED');
    expect(server.calls.length).toBe(before);
  });
  it('refuses another account, a forged lease, invalid agent, private payload and scope injection', async () => {
    const f = await fixture(); const q = await enqueueCapabilityJob(owner, f.request); const j = await claim(q.id);
    await expect(enqueueCapabilityJob(other, f.request)).rejects.toThrow('Tool not found');
    expect(await getCapabilityJob(other, q.id)).toBeNull();
    const before = server.calls.length;
    expect(await runClaimedJob({ ...j, userId: other }, worker)).toBe('SKIPPED');
    expect(await runClaimedJob(j, 'wrong-worker')).toBe('SKIPPED');
    expect(server.calls.length).toBe(before);
    await expect(enqueueCapabilityJob(owner, { ...f.request, agentId: 'invented' })).rejects.toThrow('Agent unavailable');
    await expect(enqueueCapabilityJob(owner, { ...f.request, args: { text: 'founder_private' } })).rejects.toThrow('Private markers');
    await expect(enqueueCapabilityJob(owner, { ...f.request, subject: { type: 'OWNER' } })).rejects.toThrow('Invalid');
    await runClaimedJob(j, worker);
  });
  it('does not dispatch a tampered or expired queued payload', async () => {
    for (const mode of ['tamper', 'expired']) {
      const f = await fixture(); const q = await enqueueCapabilityJob(owner, f.request);
      await prisma.agentJob.update({ where: { id: q.id }, data: mode === 'tamper' ? { capabilityRequestEnc: encryptKey(JSON.stringify({ ...f.request, args: { text: 'tampered' } })) } : { createdAt: new Date(Date.now() - CAPABILITY_QUEUE_TTL_MS - 1000) } });
      const before = server.calls.length;
      expect(await runClaimedJob(await claim(q.id), worker)).toBe('FAILED');
      expect(server.calls.length).toBe(before);
    }
  });
  it('does not reclaim an interrupted dispatch and reports UNKNOWN after its lease expires', async () => {
    const f = await fixture(); const q = await enqueueCapabilityJob(owner, f.request);
    await prisma.agentJob.update({ where: { id: q.id }, data: { lastStatus: 'DISPATCHING', leaseOwner: worker, leaseUntil: new Date(Date.now() - 1000) } });
    expect((await claimDueJobs(worker, 1000)).some((j) => j.id === q.id)).toBe(false);
    expect((await getCapabilityJob(owner, q.id))?.lastStatus).toBe('UNKNOWN');
  });
  it('a failed write-ahead job receipt rolls back dispatch and sends nothing', async () => {
    const f = await fixture(); const q = await enqueueCapabilityJob(owner, f.request); const j = await claim(q.id);
    const before = server.calls.length;
    const spy = vi.spyOn(ledger, 'recordAction').mockRejectedValueOnce(new Error('ledger unavailable'));
    expect(await runClaimedJob(j, worker)).toBe('FAILED'); spy.mockRestore();
    expect(server.calls.length).toBe(before);
    expect((await getCapabilityJob(owner, q.id))?.lastStatus).toBe('QUEUED');
    await runClaimedJob(j, worker);
  });
  it('a real provider timeout is UNKNOWN and is never automatically replayed', async () => {
    const slow = await startMockMcp({ delayMs: 400 });
    try {
      const f = await fixture('A', true, slow);
      await prisma.tool.update({ where: { id: f.tool.id }, data: { timeoutMs: 150 } });
      const q = await enqueueCapabilityJob(owner, f.request);
      const j = await claim(q.id);
      expect(await runClaimedJob(j, worker)).toBe('FAILED');
      expect((await getCapabilityJob(owner, q.id))?.lastStatus).toBe('UNKNOWN');
      expect((await claimDueJobs(worker, 1000)).some((r) => r.id === q.id)).toBe(false);
      expect(await runClaimedJob(j, worker)).toBe('SKIPPED');
      expect(slow.calls.length).toBe(1);
    } finally { await slow.close(); }
  });
});

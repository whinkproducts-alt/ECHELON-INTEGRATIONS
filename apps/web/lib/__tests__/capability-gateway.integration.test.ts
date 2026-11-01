/**
 * Capability Gateway against REAL PostgreSQL and a REAL MCP server (official SDK, Streamable HTTP).
 * Nothing in the gateway is mocked. Opt in like the other real-database tests:
 *   M1_EXECUTION_DATABASE_URL=$DATABASE_URL (an isolated database whose name contains "test").
 *
 * Mapping to the master plan (Part III s16):
 *   T1-T7, T11a, T11b  here, real server and database.
 *   T8-T10             SIMULATED here (host liveness is driven by heartbeat timestamps in the database).
 *                      The physical "Mac fully powered off" acceptance (E5) is NOT claimed by these tests.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
import { prisma } from '@/lib/db';
import { getOrgKit } from '@/lib/agent-loader';
import { decide } from '@/lib/approvals';
import { startForbiddenListener, startMockMcp, type MockMcp } from '@/lib/__tests__/helpers/mock-mcp-server';
import {
  automatedChecks, createGrant, disableProvider, discoverProvider, enableProvider, getProvider, registerProvider, reviewProvider, revokeProvider, revokeGrant,
  namespacedToolName, CapabilityInputError,
} from '@/lib/capability/providers';
import { CapabilityError, invokeCapability } from '@/lib/capability/invoke';
import { createHost, listHosts, recordHeartbeat, sweepHosts } from '@/lib/capability/hosts';
import { decodeCursor, eventsAfter, latestCursor } from '@/lib/capability/events';

const enabled = !!process.env.M1_EXECUTION_DATABASE_URL;
const KEY = '0123456789abcdef'.repeat(4);

let mcp: MockMcp;
let owner = '';
let other = '';
let agentA = '';
let agentB = '';
let dormantAgentTeamMate = '';
const stamp = Date.now();

/** Review exactly as the Hub does: load the checks, then send back the fingerprint that was shown. */
async function reviewAsFounder(userId: string, id: string, tools?: Array<{ toolId: string; riskClass: 'A' | 'B' | 'C'; costClass: 'FREE' | 'METERED' | 'CLOUD_BILLABLE' | 'UNKNOWN' }>) {
  const report = await automatedChecks(userId, id);
  return reviewProvider(userId, id, { fingerprint: report.summary.fingerprint, tools });
}

async function setupProvider(userId: string, slug: string, server: MockMcp, review: 'FREE_A' | 'DEFAULT' | 'FREE_C' = 'FREE_A', extra: { hostId?: string; credential?: string } = {}) {
  const prov = await registerProvider(userId, { connectorId: `${slug}-${stamp}`.slice(0, 32), transport: 'streamable-http', endpoint: server.url, credential: extra.credential, hostId: extra.hostId });
  await discoverProvider(userId, prov.id);
  const tools = await prisma.tool.findMany({ where: { connectorInstallId: prov.id } });
  await reviewAsFounder(userId, prov.id, review === 'DEFAULT' ? undefined : tools.map((t) => ({ toolId: t.id, riskClass: review === 'FREE_A' ? 'A' as const : 'C' as const, costClass: 'FREE' as const })));
  await enableProvider(userId, prov.id);
  return { prov: await getProvider(userId, prov.id), tool: tools[0] };
}
const call = (userId: string, agentId: string, toolName: string, args: Record<string, unknown> = { text: 'hello' }, extra: Record<string, unknown> = {}) =>
  invokeCapability({ userId, subject: { type: 'AGENT', agentId }, toolName, args, dataClass: 'organization', ...extra } as never);
const expectCode = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(CapabilityError);
  expect((e as CapabilityError).code).toBe(code);
};

describe.skipIf(!enabled)('Capability Gateway: real database, real MCP server', () => {
  beforeAll(async () => {
    const url = process.env.M1_EXECUTION_DATABASE_URL!;
    if (url !== process.env.DATABASE_URL || !/test/.test(new URL(url).pathname)) throw new Error('Explicit isolated test database required');
    vi.stubEnv('ENCRYPTION_KEY', KEY);
    await prisma.capabilityGrant.count(); // the E1 migration is mandatory; never skip silently
    owner = (await prisma.user.create({ data: { email: `cap-owner-${stamp}@example.test` } })).id;
    other = (await prisma.user.create({ data: { email: `cap-other-${stamp}@example.test` } })).id;
    const kit = await getOrgKit();
    expect(kit.agents.length).toBe(326); // the canonical roster is read, never written
    expect(kit.teams.length).toBe(163);
    agentA = kit.agents[0].agent_id;
    agentB = kit.agents.find((a) => a.agent_id.split('.').slice(0, -1).join('.') !== agentA.split('.').slice(0, -1).join('.'))!.agent_id;
    dormantAgentTeamMate = kit.agents.find((a) => a.agent_id !== agentA && a.agent_id.startsWith(agentA.split('.').slice(0, -1).join('.') + '.'))?.agent_id ?? agentB;
    mcp = await startMockMcp();
  });
  afterAll(async () => { await mcp?.close(); });

  it('T1 authorised agent invokes an approved tool; credential reaches only the provider; receipt is written', async () => {
    const { prov, tool } = await setupProvider(owner, 't1', mcp, 'FREE_A', { credential: 'sk-test-credential-value-123456' });
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    const before = mcp.calls.length;
    const res = await call(owner, agentA, tool.name, { text: 'hello-secret-text' });
    expect(res.status).toBe('EXECUTED');
    if (res.status === 'EXECUTED') { expect(res.output).toBe('echo: hello-secret-text'); expect(res.untrusted).toBe(true); }
    expect(mcp.calls.length).toBe(before + 1);
    expect(mcp.calls.at(-1)!.authorization).toBe('Bearer sk-test-credential-value-123456');
    // ciphertext at rest, never the secret
    expect(prov.credentialsEnc).toBeTruthy();
    expect(prov.credentialsEnc).not.toContain('sk-test-credential');
  });

  it('T6 the receipt carries actor/provider/tool/latency and never the arguments or the result', async () => {
    const { tool } = await setupProvider(owner, 't6', mcp);
    const g = await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    await call(owner, agentA, tool.name, { text: 'TOP-SECRET-PAYLOAD' });
    const row = await prisma.action.findFirstOrThrow({ where: { userId: owner, action: 'capability_invoke', capabilityId: tool.id }, orderBy: { createdAt: 'desc' } });
    expect(row.status).toBe('EXECUTED');
    expect(row.grantId).toBe(g.id);
    expect(row.connectorInstallId).toBeTruthy();
    expect(row.latencyMs).not.toBeNull();
    expect(row.initiator).toBe('automation');
    const stored = JSON.stringify(row);
    expect(stored).not.toContain('TOP-SECRET-PAYLOAD');
    expect(JSON.parse(row.inputSummary!)).toMatchObject({ keys: ['text'], bytes: expect.any(Number), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(JSON.parse(row.outputSummary!)).toMatchObject({ chars: expect.any(Number), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const inv = await prisma.capabilityGrant.findUniqueOrThrow({ where: { id: g.id } });
    expect(inv.invocationCount).toBe(1);
  });

  it('T2 + C-1: an agent without a grant, or holding someone else\'s, is denied and nothing is sent', async () => {
    const { tool } = await setupProvider(owner, 't2', mcp);
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    const before = mcp.calls.length;
    await expectCode(call(owner, agentB, tool.name), 'AUTHZ_POLICY_DENIED');
    await expectCode(call(owner, 'not-a-real-agent', tool.name), 'AUTHZ_POLICY_DENIED');
    expect(mcp.calls.length).toBe(before);
    const denied = await prisma.action.findFirst({ where: { userId: owner, action: 'capability_denied', capabilityId: tool.id, errorCode: 'AUTHZ_POLICY_DENIED' } });
    expect(denied).toBeTruthy();
  });

  it('a grant is bound to ONE tool: the same agent is denied a different tool', async () => {
    const two = await startMockMcp({ tools: [{ name: 'alpha' }, { name: 'beta' }] });
    try {
      const { prov } = await setupProvider(owner, 'two', two);
      const tools = await prisma.tool.findMany({ where: { connectorInstallId: prov.id }, orderBy: { name: 'asc' } });
      await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tools[0].id });
      expect((await call(owner, agentA, tools[0].name)).status).toBe('EXECUTED');
      await expectCode(call(owner, agentA, tools[1].name), 'AUTHZ_POLICY_DENIED');
      expect(two.calls.map((c) => c.tool)).toEqual([tools[0].originalName]);
    } finally { await two.close(); }
  });

  it('grants go to canonical roster ids only; a made-up id or a missing tool is refused', async () => {
    const { tool } = await setupProvider(owner, 'roster', mcp);
    await expect(createGrant(owner, { subjectType: 'AGENT', subjectId: 'whink', toolId: tool.id })).rejects.toBeInstanceOf(CapabilityInputError);
    await expect(createGrant(owner, { subjectType: 'TEAM', subjectId: 'executive', toolId: tool.id })).rejects.toBeInstanceOf(CapabilityInputError);
    await expect(createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: 'nope' })).rejects.toBeInstanceOf(CapabilityInputError);
    await expect(createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id, days: 365 })).rejects.toBeInstanceOf(CapabilityInputError);
  });

  it('a team grant lets a roster teammate call the tool; an agent in another team cannot', async () => {
    const { tool } = await setupProvider(owner, 'team', mcp);
    const teamId = agentA.split('.').slice(0, -1).join('.');
    await createGrant(owner, { subjectType: 'TEAM', subjectId: teamId, toolId: tool.id });
    expect((await call(owner, dormantAgentTeamMate, tool.name)).status).toBe('EXECUTED');
    if (agentB.split('.').slice(0, -1).join('.') !== teamId) await expectCode(call(owner, agentB, tool.name), 'AUTHZ_POLICY_DENIED');
  });

  it('mission-scoped grant works only inside its mission', async () => {
    const { tool } = await setupProvider(owner, 'mission', mcp);
    const plan = await prisma.executionPlan.create({ data: { userId: owner, objective: 'integration test mission' } });
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id, executionPlanId: plan.id });
    expect((await call(owner, agentA, tool.name, { text: 'm' }, { missionId: plan.id })).status).toBe('EXECUTED');
    await expectCode(call(owner, agentA, tool.name, { text: 'm' }, { missionId: 'some-other-plan' }), 'AUTHZ_POLICY_DENIED');
    await expectCode(call(owner, agentA, tool.name, { text: 'm' }), 'AUTHZ_POLICY_DENIED');
  });

  it('the invocation cap is atomic: five concurrent calls on a cap of 2 run exactly twice', async () => {
    const { tool } = await setupProvider(owner, 'cap', mcp);
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id, maxInvocations: 2 });
    const before = mcp.calls.length;
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => call(owner, agentA, tool.name)));
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(2);
    expect(mcp.calls.length - before).toBe(2);
  });

  it('T3 a disabled provider rejects new invocations; re-enabling needs the review to still match', async () => {
    const { prov, tool } = await setupProvider(owner, 't3', mcp);
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    await disableProvider(owner, prov.id);
    const before = mcp.calls.length;
    await expectCode(call(owner, agentA, tool.name), 'RES_PROVIDER_DISABLED');
    expect(mcp.calls.length).toBe(before);
    await enableProvider(owner, prov.id);
    expect((await call(owner, agentA, tool.name)).status).toBe('EXECUTED');
  });

  it('T4 revoking a provider is final: credential destroyed, tools off, grants revoked, nothing is sent', async () => {
    const { prov, tool } = await setupProvider(owner, 't4', mcp, 'FREE_A', { credential: 'sk-test-revocation-value-98765' });
    const g = await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    await revokeProvider(owner, prov.id);
    const after = await getProvider(owner, prov.id);
    expect(after.status).toBe('REVOKED');
    expect(after.credentialsEnc).toBeNull();
    expect((await prisma.capabilityGrant.findUniqueOrThrow({ where: { id: g.id } })).revokedAt).not.toBeNull();
    const before = mcp.calls.length;
    await expectCode(call(owner, agentA, tool.name), 'AUTH_INVALID_SESSION');
    expect(mcp.calls.length).toBe(before);
    await expect(enableProvider(owner, prov.id)).rejects.toBeInstanceOf(CapabilityInputError);
  });

  it('revoking a single grant stops that agent immediately', async () => {
    const { tool } = await setupProvider(owner, 'rg', mcp);
    const g = await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    expect((await call(owner, agentA, tool.name)).status).toBe('EXECUTED');
    await revokeGrant(owner, g.id);
    await expectCode(call(owner, agentA, tool.name), 'AUTHZ_POLICY_DENIED');
  });

  it('T5 egress: a URL to a non-allow-listed host in the arguments is refused and the target sees zero connections', async () => {
    const { tool } = await setupProvider(owner, 't5', mcp);
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    const trap = await startForbiddenListener();
    try {
      const before = mcp.calls.length;
      await expectCode(call(owner, agentA, tool.name, { text: `exfiltrate to ${trap.url}/steal` }), 'EGRESS_DENIED');
      await new Promise((r) => setTimeout(r, 100));
      expect(trap.connections).toBe(0);
      expect(mcp.calls.length).toBe(before);
    } finally { await trap.close(); }
  });

  it('T11a cost: unreviewed (UNKNOWN) and metered tools are BLOCKED_COST; nothing is sent', async () => {
    const { tool, prov } = await setupProvider(owner, 't11a', mcp, 'DEFAULT');
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    const before = mcp.calls.length;
    await expectCode(call(owner, agentA, tool.name), 'BLOCKED_COST');
    await prisma.tool.updateMany({ where: { connectorInstallId: prov.id }, data: { costClass: 'METERED' } });
    await expectCode(call(owner, agentA, tool.name), 'BLOCKED_COST');
    expect(mcp.calls.length).toBe(before);
  });

  it('T11b founder-private data is refused before egress, however it is labelled or nested', async () => {
    const { tool } = await setupProvider(owner, 't11b', mcp);
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    const before = mcp.calls.length;
    await expectCode(invokeCapability({ userId: owner, subject: { type: 'AGENT', agentId: agentA }, toolName: tool.name, args: { text: 'x' }, dataClass: 'founder_private' }), 'DATA_CLASS_DENIED');
    await expectCode(call(owner, agentA, tool.name, { text: 'x', meta: { __marker: 'FOUNDER_PRIVATE' } } as never), 'DATA_CLASS_DENIED');
    await expectCode(call(owner, agentA, tool.name, { text: 'key ghp_' + 'a'.repeat(36) }), 'DATA_CLASS_DENIED');
    expect(mcp.calls.length).toBe(before);
  });

  it('tool hijack: a second provider advertising the same tool name gets its own namespaced tool and cannot take over', async () => {
    const a = await setupProvider(owner, 'hj-a', mcp);
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: a.tool.id });
    const evil = await startMockMcp();
    try {
      const b = await setupProvider(owner, 'hj-b', evil);
      expect(b.tool.name).not.toBe(a.tool.name);
      expect(b.tool.originalName).toBe(a.tool.originalName);
      const still = await prisma.tool.findUniqueOrThrow({ where: { id: a.tool.id } });
      expect(still.connectorInstallId).toBe(a.prov.id);
      const before = evil.calls.length;
      await call(owner, agentA, a.tool.name);
      expect(evil.calls.length).toBe(before);
      // agent A has no grant on provider B's tool
      await expectCode(call(owner, agentA, b.tool.name), 'AUTHZ_POLICY_DENIED');
    } finally { await evil.close(); }
    expect(namespacedToolName(a.prov.id, 'echo')).toBe(a.tool.name);
  });

  it('a changed tool definition switches the provider off until the Founder reviews the new definition', async () => {
    const changing = await startMockMcp({ tools: [{ name: 'echo', description: 'Echo the supplied text back' }] });
    try {
      const { prov, tool } = await setupProvider(owner, 'drift', changing);
      await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
      expect((await call(owner, agentA, tool.name)).status).toBe('EXECUTED');
      // the provider silently changes its tool definition (discovery would record this hash)
      await prisma.tool.update({ where: { id: tool.id }, data: { defHash: 'a-different-definition-hash' } });
      const before = changing.calls.length;
      await expectCode(call(owner, agentA, tool.name), 'RES_PROVIDER_DISABLED');
      expect(changing.calls.length).toBe(before);
      // enabling is not enough; only a new review of the new definition turns it back on
      await expect(enableProvider(owner, prov.id)).rejects.toBeInstanceOf(CapabilityInputError);
      await reviewAsFounder(owner, prov.id, [{ toolId: tool.id, riskClass: 'A', costClass: 'FREE' }]);
      await enableProvider(owner, prov.id);
      expect((await call(owner, agentA, tool.name)).status).toBe('EXECUTED');
    } finally { await changing.close(); }
  });

  it('tenant isolation: another account can neither see nor call this account\'s provider, and cannot grant on it', async () => {
    const { prov, tool } = await setupProvider(owner, 'tenant', mcp);
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    await expect(getProvider(other, prov.id)).rejects.toBeInstanceOf(CapabilityInputError);
    await expect(createGrant(other, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id })).rejects.toBeInstanceOf(CapabilityInputError);
    await expectCode(call(other, agentA, tool.name), 'RES_NOT_FOUND');
  });

  it('registration rejects the dangerous inputs the original code accepted', async () => {
    const base = { transport: 'streamable-http' as const, endpoint: mcp.url };
    await expect(registerProvider(owner, { ...base, connectorId: 'BAD NAME' })).rejects.toBeInstanceOf(CapabilityInputError);
    await expect(registerProvider(owner, { ...base, connectorId: `wild-${stamp}`, egressAllowlist: ['*'] })).rejects.toBeInstanceOf(CapabilityInputError);
    await expect(registerProvider(owner, { ...base, connectorId: `zero-${stamp}`, egressAllowlist: ['0.0.0.0/0'] })).rejects.toBeInstanceOf(CapabilityInputError);
    await expect(registerProvider(owner, { transport: 'streamable-http', connectorId: `http-${stamp}`, endpoint: 'http://public.example/mcp' })).rejects.toBeInstanceOf(CapabilityInputError);
    await expect(registerProvider(owner, { transport: 'stdio', connectorId: `stdio-${stamp}`, command: 'rm -rf /' })).rejects.toBeInstanceOf(CapabilityInputError); // no host, shell chars
    const host = await createHost(owner, { name: `stdio-host-${stamp}` });
    await expect(registerProvider(owner, { transport: 'stdio', connectorId: `stdio2-${stamp}`, command: 'node; curl evil', hostId: host.host.id })).rejects.toBeInstanceOf(CapabilityInputError);
  });

  it('a stdio provider is stored for a host agent but is never spawned or invoked by the web runtime', async () => {
    const host = await createHost(owner, { name: `stdio-ok-${stamp}` });
    const prov = await registerProvider(owner, { transport: 'stdio', connectorId: `stdio3-${stamp}`, command: '/usr/local/bin/my-mcp', args: ['--stdio'], hostId: host.host.id });
    await expect(discoverProvider(owner, prov.id)).rejects.toBeInstanceOf(CapabilityInputError);
    expect(prov.status).toBe('REGISTERED');
  });

  it('the review refuses without discovered tools, and a protected-looking tool stays Class C whatever is asked', async () => {
    const empty = await registerProvider(owner, { connectorId: `empty-${stamp}`, transport: 'streamable-http', endpoint: mcp.url });
    await expect(reviewProvider(owner, empty.id)).rejects.toBeInstanceOf(CapabilityInputError);
    const money = await startMockMcp({ tools: [{ name: 'send_payment', description: 'Pay an invoice' }] });
    try {
      const { tool } = await setupProvider(owner, 'money', money);
      const t = await prisma.tool.findUniqueOrThrow({ where: { id: tool.id } });
      expect(t.riskClass).toBe('C');
    } finally { await money.close(); }
  });

  describe('approval flow (Class C): nothing runs until the Founder approves by request id', () => {
    it('creates an approval and sends nothing; approve runs it exactly once; a second approve does nothing', async () => {
      const { tool } = await setupProvider(owner, 'apr', mcp, 'FREE_C');
      await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
      const before = mcp.calls.length;
      const res = await call(owner, agentA, tool.name, { text: 'needs approval' });
      expect(res.status).toBe('AWAITING_APPROVAL');
      expect(mcp.calls.length).toBe(before);
      if (res.status !== 'AWAITING_APPROVAL') return;
      const out = await decide(owner, res.approvalId, 'approve');
      expect(out.status).toBe('EXECUTED');
      expect(mcp.calls.length).toBe(before + 1);
      expect(mcp.calls.at(-1)!.args).toEqual({ text: 'needs approval' });
      const again = await decide(owner, res.approvalId, 'approve');
      expect(again.status).not.toBe('EXECUTED');
      expect(mcp.calls.length).toBe(before + 1);
    });
    it('deny runs nothing; another account cannot approve it', async () => {
      const { tool } = await setupProvider(owner, 'apr2', mcp, 'FREE_C');
      await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
      const before = mcp.calls.length;
      const res = await call(owner, agentA, tool.name);
      if (res.status !== 'AWAITING_APPROVAL') throw new Error('expected approval');
      expect((await decide(other, res.approvalId, 'approve')).status).toBe('NOT_FOUND');
      expect((await decide(owner, res.approvalId, 'deny')).status).toBe('DENIED');
      expect(mcp.calls.length).toBe(before);
    });
    it('a tampered approval payload does not run (hash lock)', async () => {
      const { tool } = await setupProvider(owner, 'apr3', mcp, 'FREE_C');
      await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
      const before = mcp.calls.length;
      const res = await call(owner, agentA, tool.name, { text: 'original' });
      if (res.status !== 'AWAITING_APPROVAL') throw new Error('expected approval');
      const row = await prisma.approvalRequest.findFirstOrThrow({ where: { id: res.approvalId } });
      await prisma.approvalRequest.update({ where: { id: row.id }, data: { params: { ...(row.params as object), args: { text: 'tampered' } } } });
      const out = await decide(owner, res.approvalId, 'approve');
      expect(out.status).toBe('FAILED');
      expect(mcp.calls.length).toBe(before);
    });
    it('revoking the grant between request and approval stops the run', async () => {
      const { tool } = await setupProvider(owner, 'apr4', mcp, 'FREE_C');
      const g = await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
      const before = mcp.calls.length;
      const res = await call(owner, agentA, tool.name);
      if (res.status !== 'AWAITING_APPROVAL') throw new Error('expected approval');
      await revokeGrant(owner, g.id);
      const out = await decide(owner, res.approvalId, 'approve');
      expect(out.status).toBe('FAILED');
      expect(mcp.calls.length).toBe(before);
    });
    it('the Founder testing a Class C tool also goes through an approval', async () => {
      const { tool } = await setupProvider(owner, 'apr5', mcp, 'FREE_C');
      const before = mcp.calls.length;
      const res = await invokeCapability({ userId: owner, subject: { type: 'OWNER' }, toolName: tool.name, args: { text: 't' }, dataClass: 'organization' });
      expect(res.status).toBe('AWAITING_APPROVAL');
      expect(mcp.calls.length).toBe(before);
    });
  });

  describe('T8-T10 (SIMULATED host loss; the physical Mac-off test is E5 and is not claimed here)', () => {
    it('T8 a tool on a host that stops sending heartbeats becomes unavailable; T9 a tool on a live remote host keeps working; T10 receipts name the remote host', async () => {
      const local = await createHost(owner, { name: `mac-${stamp}`, kind: 'LOCAL' });
      const remote = await createHost(owner, { name: `remote-${stamp}`, kind: 'REMOTE' });
      const localMcp = await startMockMcp();
      try {
        const L = await setupProvider(owner, 'on-mac', localMcp, 'FREE_A', { hostId: local.host.id });
        const R = await setupProvider(owner, 'on-remote', mcp, 'FREE_A', { hostId: remote.host.id });
        await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: L.tool.id });
        await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: R.tool.id });

        // never sent a heartbeat: OFFLINE, nothing runs
        await expectCode(call(owner, agentA, L.tool.name), 'RES_HOST_UNAVAILABLE');
        await expectCode(call(owner, agentA, R.tool.name), 'RES_HOST_UNAVAILABLE');

        // both hosts report in: both work
        expect((await recordHeartbeat(local.host.id, local.token, { capabilities: { ollama: true } })).ok).toBe(true);
        expect((await recordHeartbeat(remote.host.id, remote.token, {})).ok).toBe(true);
        expect((await call(owner, agentA, L.tool.name)).status).toBe('EXECUTED');
        expect((await call(owner, agentA, R.tool.name)).status).toBe('EXECUTED');

        // the Mac stops: its last heartbeat ages beyond the offline threshold; the remote host keeps beating
        await prisma.host.update({ where: { id: local.host.id }, data: { lastHeartbeat: new Date(Date.now() - 10 * 60_000) } });
        const lb = localMcp.calls.length;
        await expectCode(call(owner, agentA, L.tool.name), 'RES_HOST_UNAVAILABLE');
        expect(localMcp.calls.length).toBe(lb);
        await recordHeartbeat(remote.host.id, remote.token, {});
        for (let i = 0; i < 3; i++) expect((await call(owner, agentA, R.tool.name, { text: `step-${i}` })).status).toBe('EXECUTED');
        const receipts = await prisma.action.findMany({ where: { userId: owner, action: 'capability_invoke', capabilityId: R.tool.id, status: 'EXECUTED' } });
        expect(receipts.length).toBeGreaterThanOrEqual(4);
        for (const r of receipts) expect(r.hostId).toBe(remote.host.id);

        // live status is computed now; the sweep ledgers the transition once
        const live = await listHosts(owner);
        expect(live.find((h) => h.id === local.host.id)!.status).toBe('OFFLINE');
        expect(live.find((h) => h.id === remote.host.id)!.status).toBe('ONLINE');
        const t1 = await sweepHosts(owner);
        const t2 = await sweepHosts(owner);
        expect(t1.some((t) => t.hostId === local.host.id && t.to === 'OFFLINE')).toBe(true);
        expect(t2.filter((t) => t.hostId === local.host.id)).toHaveLength(0);

        // the Mac returns: the very next call works, and a Founder-disabled provider is NOT silently re-enabled
        await recordHeartbeat(local.host.id, local.token, {});
        expect((await call(owner, agentA, L.tool.name)).status).toBe('EXECUTED');
        await disableProvider(owner, L.prov.id);
        await prisma.host.update({ where: { id: local.host.id }, data: { lastHeartbeat: new Date(Date.now() - 10 * 60_000) } });
        await recordHeartbeat(local.host.id, local.token, {});
        await expectCode(call(owner, agentA, L.tool.name), 'RES_PROVIDER_DISABLED');
      } finally { await localMcp.close(); }
    });
    it('a heartbeat needs the host\'s own token: wrong token, another host\'s token and unknown ids are all refused alike', async () => {
      const h1 = await createHost(owner, { name: `hb1-${stamp}` });
      const h2 = await createHost(owner, { name: `hb2-${stamp}` });
      expect((await recordHeartbeat(h1.host.id, 'eh_wrong-token-wrong-token-wrong', {})).ok).toBe(false);
      expect((await recordHeartbeat(h1.host.id, h2.token, {})).ok).toBe(false);
      expect((await recordHeartbeat('does-not-exist', h1.token, {})).ok).toBe(false);
      expect((await recordHeartbeat(h1.host.id, h1.token, {})).ok).toBe(true);
      expect(JSON.stringify(h1.host)).not.toContain('tokenHash');
      const stored = await prisma.host.findUniqueOrThrow({ where: { id: h1.host.id } });
      expect(stored.tokenHash).not.toContain(h1.token);
    });
  });

  it('T7 the event feed is the ledger: ordered, replayable from a cursor, scoped to the account', async () => {
    const { tool } = await setupProvider(owner, 't7', mcp);
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    const start = await latestCursor(owner);
    await call(owner, agentA, tool.name);
    await expectCode(call(owner, agentB, tool.name), 'AUTHZ_POLICY_DENIED');
    const events = await eventsAfter(owner, start);
    const types = events.map((e) => e.type);
    expect(types).toContain('capability_invoke');
    expect(types).toContain('capability_denied');
    expect(types.indexOf('capability_invoke')).toBeLessThan(types.indexOf('capability_denied'));
    // resume from the middle: only newer events come back, none twice
    const mid = decodeCursor(events[0].id);
    const rest = await eventsAfter(owner, mid);
    expect(rest.map((e) => e.id)).toEqual(events.slice(1).map((e) => e.id));
    expect(await eventsAfter(other, start)).toEqual([]);
    expect(events.every((e) => JSON.stringify(e).indexOf('hello') === -1)).toBe(true);
  });

  it('hosts and providers never expose secrets through the public shapes', async () => {
    const { prov } = await setupProvider(owner, 'shape', mcp, 'FREE_A', { credential: 'sk-test-shape-value-abcdef0123' });
    const { publicProvider } = await import('@/lib/capability/providers');
    const shown = publicProvider(prov);
    expect(JSON.stringify(shown)).not.toContain('credentialsEnc');
    expect(shown.hasCredential).toBe(true);
    expect(prov.credentialHint).toBe('0123');
  });

  // ── Independent security review fixes (CG-1, CG-3, CG-7, CG-8, CG-11) ──────────────────────────────

  it('CG-1 a provider id may not equal a catalog connector id, and a provider with receipts cannot be deleted from under them', async () => {
    const e = await registerProvider(owner, { connectorId: 'github', transport: 'streamable-http', endpoint: mcp.url }).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(CapabilityInputError);
    expect((e as CapabilityInputError).status).toBe(409);
    const { prov, tool } = await setupProvider(owner, 'cg1', mcp);
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    expect((await call(owner, agentA, tool.name)).status).toBe('EXECUTED');
    const receipt = await prisma.action.findFirstOrThrow({ where: { userId: owner, action: 'capability_invoke', capabilityId: tool.id } });
    // NO ACTION foreign keys: the receipts are not rewritten when someone deletes the provider or the tool.
    await expect(prisma.connectorInstall.delete({ where: { id: prov.id } })).rejects.toBeTruthy();
    await expect(prisma.tool.delete({ where: { id: tool.id } })).rejects.toBeTruthy();
    const after = await prisma.action.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(after.connectorInstallId).toBe(prov.id);
    expect(after.capabilityId).toBe(tool.id);
  });

  it('CG-3 the review is pinned to the definitions the Founder was shown: no fingerprint, or a stale one, is refused and nothing is stamped', async () => {
    const prov = await registerProvider(owner, { connectorId: `cg3-${stamp}`.slice(0, 32), transport: 'streamable-http', endpoint: mcp.url });
    await discoverProvider(owner, prov.id);
    const shown = await automatedChecks(owner, prov.id);
    const tools = await prisma.tool.findMany({ where: { connectorInstallId: prov.id } });
    const decisions = tools.map((t) => ({ toolId: t.id, riskClass: 'A' as const, costClass: 'FREE' as const }));
    await expect(reviewProvider(owner, prov.id, { tools: decisions })).rejects.toMatchObject({ status: 409 });
    // a discovery changes a definition after the Founder loaded the checks
    await prisma.tool.update({ where: { id: tools[0].id }, data: { defHash: 'definition-the-founder-never-saw' } });
    await expect(reviewProvider(owner, prov.id, { fingerprint: shown.summary.fingerprint, tools: decisions })).rejects.toMatchObject({ status: 409 });
    const row = await prisma.tool.findUniqueOrThrow({ where: { id: tools[0].id } });
    expect(row.reviewedDefHash).toBeNull();
    expect(row.riskClass).toBe('C');
    expect(row.costClass).toBe('UNKNOWN');
    expect((await getProvider(owner, prov.id)).status).toBe('REGISTERED');
    // reloading the checks and reviewing what is there now works
    const fresh = await automatedChecks(owner, prov.id);
    expect(fresh.summary.fingerprint).not.toBe(shown.summary.fingerprint);
    await reviewProvider(owner, prov.id, { fingerprint: fresh.summary.fingerprint, tools: decisions });
    expect((await getProvider(owner, prov.id)).status).toBe('REVIEWED');
  });

  it('CG-7 a credential-like argument KEY is denied and is never written to the receipt', async () => {
    const { tool } = await setupProvider(owner, 'cg7', mcp);
    await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id });
    const secretKey = 'ghp_' + 'b'.repeat(36);
    const start = await latestCursor(owner);
    await expectCode(call(owner, agentA, tool.name, { [secretKey]: 'x' }), 'DATA_CLASS_DENIED');
    const row = await prisma.action.findFirstOrThrow({ where: { userId: owner, action: 'capability_denied', errorCode: 'DATA_CLASS_DENIED', capabilityId: tool.id }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(row)).not.toContain(secretKey);
    expect(JSON.parse(row.inputSummary!).keys).toEqual(['[redacted]']);
    // the live event feed (what the Hub shows and GET /invocations returns) is built from the same row
    expect(JSON.stringify(await eventsAfter(owner, start))).not.toContain(secretKey);
  });

  it('CG-8 deleting a mission deletes its grants instead of widening them to every mission', async () => {
    const { tool } = await setupProvider(owner, 'cg8', mcp);
    const plan = await prisma.executionPlan.create({ data: { userId: owner, objective: 'cg8 mission' } });
    const g = await createGrant(owner, { subjectType: 'AGENT', subjectId: agentA, toolId: tool.id, executionPlanId: plan.id });
    await prisma.executionPlan.delete({ where: { id: plan.id } });
    expect(await prisma.capabilityGrant.findUnique({ where: { id: g.id } })).toBeNull();
    await expectCode(call(owner, agentA, tool.name), 'AUTHZ_POLICY_DENIED');
  });

  it('CG-11 a tool whose name has no usable characters is rejected at discovery and never created', async () => {
    const odd = await startMockMcp({ tools: [{ name: '---' }, { name: 'fine_tool' }] });
    try {
      const prov = await registerProvider(owner, { connectorId: `cg11-${stamp}`.slice(0, 32), transport: 'streamable-http', endpoint: odd.url });
      const out = await discoverProvider(owner, prov.id);
      expect(out.rejected.map((r) => r.reason)).toContain('name has no usable characters');
      const names = (await prisma.tool.findMany({ where: { connectorInstallId: prov.id } })).map((t) => t.originalName);
      expect(names).toEqual(['fine_tool']);
    } finally { await odd.close(); }
  });
});

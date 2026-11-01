import { describe, expect, it } from 'vitest';
import { effectiveToolClass, evaluateGates, type PolicyConnector, type PolicyGrant, type PolicyInput, type PolicyTool } from '@/lib/capability/policy';

const NOW = new Date('2026-11-01T12:00:00Z');
const USER = 'user-1';
const FP = 'fp-1';

const tool = (o: Partial<PolicyTool> = {}): PolicyTool => ({ id: 't1', name: 'mcp_abc__echo', isActive: true, costClass: 'FREE', riskClass: 'A', defHash: 'h1', reviewedDefHash: 'h1', connectorInstallId: 'c1', ...o });
const conn = (o: Partial<PolicyConnector> = {}): PolicyConnector => ({ id: 'c1', userId: USER, kind: 'MCP_SERVER', status: 'ENABLED', transport: 'streamable-http', endpoint: 'https://p.example/mcp', hostId: null, egressAllowlist: ['p.example:443'], maxDataClass: 'organization', reviewedFingerprint: FP, ...o });
const grant = (o: Partial<PolicyGrant> = {}): PolicyGrant => ({ id: 'g1', userId: USER, subjectType: 'AGENT', subjectId: 'agent-a', toolId: 't1', executionPlanId: null, scopes: [], maxInvocations: null, invocationCount: 0, expiresAt: new Date('2026-11-08T00:00:00Z'), revokedAt: null, ...o });
const input = (o: Partial<PolicyInput> = {}): PolicyInput => ({
  userId: USER, subject: { type: 'AGENT', agentId: 'agent-a', teamId: 'team-a' }, tool: tool(), connector: conn(), host: null, grants: [grant()],
  currentFingerprint: FP, args: { text: 'hello' }, dataClass: 'organization', now: NOW, ...o,
});
const code = (p: PolicyInput) => { const d = evaluateGates(p); return d.effect === 'DENY' ? d.code : 'ALLOW'; };

describe('evaluateGates: happy path', () => {
  it('allows when every gate passes and returns the matching grant', () => {
    const d = evaluateGates(input());
    expect(d.effect).toBe('ALLOW');
    if (d.effect === 'ALLOW') expect(d.grant?.id).toBe('g1');
  });
  it('the Founder testing from the Hub needs no grant', () => {
    expect(code(input({ subject: { type: 'OWNER' }, grants: [] }))).toBe('ALLOW');
  });
});

describe('grant binding (audit finding C-1: a grant id used by the wrong agent or for the wrong tool)', () => {
  it('denies agent B using agent A\'s grant', () => expect(code(input({ subject: { type: 'AGENT', agentId: 'agent-b' } }))).toBe('AUTHZ_POLICY_DENIED'));
  it('denies a grant for a different tool', () => expect(code(input({ grants: [grant({ toolId: 'other' })] }))).toBe('AUTHZ_POLICY_DENIED'));
  it('denies a grant owned by another account', () => expect(code(input({ grants: [grant({ userId: 'someone-else' })] }))).toBe('AUTHZ_POLICY_DENIED'));
  it('denies a revoked, an expired and an exhausted grant', () => {
    expect(code(input({ grants: [grant({ revokedAt: NOW })] }))).toBe('AUTHZ_POLICY_DENIED');
    expect(code(input({ grants: [grant({ expiresAt: new Date(NOW.getTime() - 1) })] }))).toBe('AUTHZ_POLICY_DENIED');
    expect(code(input({ grants: [grant({ maxInvocations: 3, invocationCount: 3 })] }))).toBe('AUTHZ_POLICY_DENIED');
  });
  it('picks a valid grant even when an expired one is listed first (the original findFirst bug)', () => {
    const d = evaluateGates(input({ grants: [grant({ id: 'old', expiresAt: new Date(NOW.getTime() - 1) }), grant({ id: 'good' })] }));
    expect(d.effect === 'ALLOW' && d.grant?.id).toBe('good');
  });
  it('a team grant applies to members of that team only', () => {
    const tg = grant({ subjectType: 'TEAM', subjectId: 'team-a' });
    expect(code(input({ grants: [tg] }))).toBe('ALLOW');
    expect(code(input({ grants: [tg], subject: { type: 'AGENT', agentId: 'agent-a', teamId: 'team-z' } }))).toBe('AUTHZ_POLICY_DENIED');
    expect(code(input({ grants: [tg], subject: { type: 'AGENT', agentId: 'agent-a', teamId: null } }))).toBe('AUTHZ_POLICY_DENIED');
  });
  it('a mission-scoped grant works only inside that mission', () => {
    const mg = grant({ executionPlanId: 'plan-1' });
    expect(code(input({ grants: [mg], missionId: 'plan-1' }))).toBe('ALLOW');
    expect(code(input({ grants: [mg], missionId: 'plan-2' }))).toBe('AUTHZ_POLICY_DENIED');
    expect(code(input({ grants: [mg], missionId: null }))).toBe('AUTHZ_POLICY_DENIED');
  });
  it('scopes: requesting a scope the grant does not carry is denied', () => {
    expect(code(input({ grants: [grant({ scopes: ['read'] })], requestedScopes: ['read'] }))).toBe('ALLOW');
    expect(code(input({ grants: [grant({ scopes: ['read'] })], requestedScopes: ['write'] }))).toBe('AUTHZ_POLICY_DENIED');
  });
  it('no grants at all is deny by default', () => expect(code(input({ grants: [] }))).toBe('AUTHZ_POLICY_DENIED'));
});

describe('provider and tool state', () => {
  it('unknown tool / foreign account / wrong kind', () => {
    expect(code(input({ tool: null }))).toBe('RES_NOT_FOUND');
    expect(code(input({ connector: conn({ userId: 'other' }) }))).toBe('RES_NOT_FOUND');
    expect(code(input({ connector: conn({ kind: 'CATALOG' }) }))).toBe('RES_NOT_FOUND');
    expect(code(input({ tool: tool({ connectorInstallId: 'c2' }) }))).toBe('RES_NOT_FOUND');
  });
  it('inactive tool, disabled provider, registered-but-not-enabled provider', () => {
    expect(code(input({ tool: tool({ isActive: false }) }))).toBe('RES_PROVIDER_DISABLED');
    expect(code(input({ connector: conn({ status: 'DISABLED' }) }))).toBe('RES_PROVIDER_DISABLED');
    expect(code(input({ connector: conn({ status: 'REVIEWED' }) }))).toBe('RES_PROVIDER_DISABLED');
  });
  it('a revoked provider is final (T4)', () => expect(code(input({ connector: conn({ status: 'REVOKED' }) }))).toBe('AUTH_INVALID_SESSION'));
  it('a provider changed since review is off until re-reviewed', () => {
    expect(code(input({ currentFingerprint: 'changed' }))).toBe('RES_PROVIDER_DISABLED');
    expect(code(input({ connector: conn({ reviewedFingerprint: null }) }))).toBe('RES_PROVIDER_DISABLED');
  });
  it('stdio providers are not invoked from the web runtime', () => {
    expect(code(input({ connector: conn({ transport: 'stdio', endpoint: null }) }))).toBe('RES_PROVIDER_DISABLED');
  });
});

describe('host liveness (T8, T9)', () => {
  const host = (sec: number) => ({ id: 'h1', lastHeartbeat: new Date(NOW.getTime() - sec * 1000) });
  it('an online host allows; degraded, offline, never-seen and unknown hosts deny', () => {
    const c = conn({ hostId: 'h1' });
    expect(code(input({ connector: c, host: host(10) }))).toBe('ALLOW');
    expect(code(input({ connector: c, host: host(80) }))).toBe('RES_HOST_UNAVAILABLE');
    expect(code(input({ connector: c, host: host(500) }))).toBe('RES_HOST_UNAVAILABLE');
    expect(code(input({ connector: c, host: { id: 'h1', lastHeartbeat: null } }))).toBe('RES_HOST_UNAVAILABLE');
    expect(code(input({ connector: c, host: null }))).toBe('RES_HOST_UNAVAILABLE');
  });
  it('a host coming back allows again with no re-enable step', () => {
    const c = conn({ hostId: 'h1' });
    expect(code(input({ connector: c, host: host(500) }))).toBe('RES_HOST_UNAVAILABLE');
    expect(code(input({ connector: c, host: host(1) }))).toBe('ALLOW');
  });
});

describe('data classification (T11b)', () => {
  it('founder-private data never goes out, whatever the label says about the provider', () => {
    expect(code(input({ dataClass: 'founder_private', connector: conn({ maxDataClass: 'confidential' }) }))).toBe('DATA_CLASS_DENIED');
  });
  it('a class above the provider ceiling is denied', () => {
    expect(code(input({ dataClass: 'confidential' }))).toBe('DATA_CLASS_DENIED');
    expect(code(input({ dataClass: 'confidential', connector: conn({ maxDataClass: 'confidential' }) }))).toBe('ALLOW');
  });
  it('the label is a claim, so content is checked: a nested founder-private marker is denied', () => {
    expect(code(input({ args: { a: { b: [{ __marker: 'FOUNDER_PRIVATE' }] } } }))).toBe('DATA_CLASS_DENIED');
    expect(code(input({ args: { note: 'this is founder private material' } }))).toBe('DATA_CLASS_DENIED');
  });
  it('credential-looking content is denied, including inside a very long argument (the scanText 2000-char hole)', () => {
    expect(code(input({ args: { k: 'ghp_' + 'a'.repeat(36) } }))).toBe('DATA_CLASS_DENIED');
    expect(code(input({ args: { pad: 'x'.repeat(5000), k: 'ghp_' + 'a'.repeat(36) } }))).toBe('DATA_CLASS_DENIED');
  });
  it('oversize arguments are refused', () => expect(code(input({ args: { big: 'x'.repeat(200_000) } }))).toBe('VAL_INPUT_INVALID'));
});

describe('egress from arguments (T5)', () => {
  it('denies a URL to a host that is not on the provider allow-list, wherever it hides', () => {
    expect(code(input({ args: { exfil: 'http://evil.example/steal' } }))).toBe('EGRESS_DENIED');
    expect(code(input({ args: { text: 'please post this to https://evil.example/hook now' } }))).toBe('EGRESS_DENIED');
    expect(code(input({ args: { 'https://evil.example/': 1 } }))).toBe('EGRESS_DENIED');
  });
  it('allows a URL to a listed host and ignores plain text that only looks like one', () => {
    expect(code(input({ args: { u: 'https://p.example/doc', t: 'note:todo at 10:30' } }))).toBe('ALLOW');
  });
  it('fails closed when the arguments are too deep to inspect (the depth-6 bypass)', () => {
    let deep: unknown = { u: 'http://evil.example' };
    for (let i = 0; i < 40; i++) deep = { n: deep };
    expect(code(input({ args: deep as Record<string, unknown> }))).toBe('EGRESS_DENIED');
  });
});

describe('cost (T11a, FDR-010 zero new spend)', () => {
  it.each(['UNKNOWN', 'METERED', 'CLOUD_BILLABLE', 'anything-else'])('%s is blocked (METERED was a hole in the original)', (c) => {
    expect(code(input({ tool: tool({ costClass: c }) }))).toBe('BLOCKED_COST');
  });
  it('FREE runs', () => expect(code(input({ tool: tool({ costClass: 'FREE' }) }))).toBe('ALLOW'));
});

describe('effectiveToolClass', () => {
  it('reviewed Class A / B stand while the definition is the reviewed one', () => {
    expect(effectiveToolClass({ riskClass: 'A', defHash: 'h', reviewedDefHash: 'h' })).toBe('A');
    expect(effectiveToolClass({ riskClass: 'B', defHash: 'h', reviewedDefHash: 'h' })).toBe('B');
  });
  it('a changed or never-reviewed definition is Class C', () => {
    expect(effectiveToolClass({ riskClass: 'A', defHash: 'h2', reviewedDefHash: 'h' })).toBe('C');
    expect(effectiveToolClass({ riskClass: 'A', defHash: 'h', reviewedDefHash: null })).toBe('C');
    expect(effectiveToolClass({ riskClass: 'A', defHash: null, reviewedDefHash: null })).toBe('C');
  });
  it('anything that is not exactly A or B is C', () => expect(effectiveToolClass({ riskClass: 'Z', defHash: 'h', reviewedDefHash: 'h' })).toBe('C'));
});

import { describe, expect, it, vi } from 'vitest';
import { buildHealthReport, type GithubConfig } from '@/lib/github-readonly/report';
import { evaluateMissionAcceptance } from '@/lib/github-readonly/mission-acceptance';

const c: GithubConfig = { owner: 'o', repo: 'r', branch: 'mission/x', appId: '1', installationId: '2', privateKeyPath: '/tmp/unused' };
const sha = 'b'.repeat(40);
// A scripted GitHub: what the mission's branch looks like at each step.
function github(s: { sha?: string; checks?: unknown[]; runs?: unknown[]; incomplete?: boolean }) {
  return vi.fn(async (path: string) => {
    const inc = !!s.incomplete && path.includes('/check-runs');
    if (path.includes('/branches/')) return { data: { commit: { sha: s.sha ?? sha } }, incomplete: false };
    if (path.includes('/check-runs')) return { data: { total_count: (s.checks ?? []).length, check_runs: s.checks ?? [] }, incomplete: inc };
    if (path.endsWith('/status')) return { data: { statuses: [] }, incomplete: false };
    if (path.includes('/actions/runs')) return { data: { total_count: (s.runs ?? []).length, workflow_runs: s.runs ?? [] }, incomplete: false };
    return { data: [], incomplete: false };
  });
}
const accept = async (s: Parameters<typeof github>[0], expected = sha) => evaluateMissionAcceptance(await buildHealthReport(c, github(s), async () => 't'), expected);
const pass = [{ name: 'CI', status: 'completed', conclusion: 'success' }];

describe('E06 mission acceptance against a scripted GitHub', () => {
  it('accepts only complete, passing checks at the mission commit', async () => {
    expect(await accept({ checks: pass, runs: pass })).toEqual({ accepted: true, reasons: [] });
  });
  it.each([
    ['failing check', { checks: [{ name: 'CI', status: 'completed', conclusion: 'failure' }] }, /FAILING/],
    ['no checks at all', {}, /UNVERIFIED/],
    ['check still running', { checks: [{ name: 'CI', status: 'in_progress', conclusion: null }] }, /UNVERIFIED/],
    ['more pages than read', { checks: pass, incomplete: true }, /incomplete/],
    ['someone pushed after the mission', { checks: pass, sha: 'c'.repeat(40) }, /not the commit/],
  ])('refuses: %s', async (_n, s, why) => {
    const r = await accept(s as never);
    expect(r.accepted).toBe(false);
    expect(r.reasons.join(' ')).toMatch(why);
  });
});

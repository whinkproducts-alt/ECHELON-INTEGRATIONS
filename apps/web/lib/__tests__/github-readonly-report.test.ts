import { describe, expect, it, vi } from 'vitest';
import { buildHealthReport, configFromEnv, githubApi, type GithubConfig } from '@/lib/github-readonly/report';
const c: GithubConfig = { owner: 'whinkproducts-alt', repo: 'ECHELON-CORP', branch: 'integration/echelon-capability-gateway', appId: '1', installationId: '2', privateKeyPath: '/tmp/unused' };
const sha = 'a'.repeat(40);
const token = vi.fn(async () => 'fixture-token');
function fixture(checks: unknown[] = [], runs: unknown[] = [], statuses: unknown[] = []) {
  const calls: string[] = [];
  const api = vi.fn(async (path: string, supplied: string) => {
    expect(supplied).toBe('fixture-token'); calls.push(path);
    if (path.includes('/branches/')) return { data: { commit: { sha } }, incomplete: false };
    if (path.includes('/check-runs')) return { data: { total_count: checks.length, check_runs: checks }, incomplete: false };
    if (path.endsWith('/status')) return { data: { statuses }, incomplete: false };
    if (path.includes('/actions/runs')) return { data: { total_count: runs.length, workflow_runs: runs }, incomplete: false };
    if (path.includes('/issues')) return { data: [{ title: 'Issue', html_url: 'https://github.com/example/1' }, { title: 'PR via issues', pull_request: {}, html_url: 'https://github.com/example/2' }], incomplete: false };
    if (path.includes('/pulls')) return { data: [{ title: 'PR', html_url: 'https://github.com/example/2' }], incomplete: false };
    throw new Error('unexpected API route');
  });
  return { api, calls };
}
describe('fixed GitHub report', () => {
  it('rejects unconfigured or ambiguous repository and branch values', () => {
    expect(() => configFromEnv({ ECHELON_GITHUB_OWNER: 'wrong/owner', ECHELON_GITHUB_REPO: 'ECHELON-CORP' } as unknown as NodeJS.ProcessEnv)).toThrow();
    expect(() => configFromEnv({ ECHELON_GITHUB_OWNER: c.owner, ECHELON_GITHUB_REPO: c.repo, ECHELON_GITHUB_BRANCH: '../other', ECHELON_GITHUB_APP_ID: '1', ECHELON_GITHUB_INSTALLATION_ID: '2', ECHELON_GITHUB_PRIVATE_KEY_PATH: '/tmp/x' } as unknown as NodeJS.ProcessEnv)).toThrow();
  });
  it('pins checks and Actions to the branch SHA, treats absent checks as unverified, and excludes PRs from issues', async () => {
    const f = fixture(); const r = await buildHealthReport(c, f.api, token);
    expect(r).toMatchObject({ repository: 'whinkproducts-alt/ECHELON-CORP', commit: sha, verdict: 'UNVERIFIED', incomplete: false });
    expect(r.issues).toHaveLength(1); expect(r.pulls).toHaveLength(1);
    expect(f.calls).toHaveLength(6);
    expect(f.calls.every((x) => x.startsWith('/repos/whinkproducts-alt/ECHELON-CORP/'))).toBe(true);
    expect(f.calls.filter((x) => x.includes('/check-runs') || x.includes('/status') || x.includes('/actions/runs')).every((x) => x.includes(sha))).toBe(true);
  });
  it('reports observed failures and incomplete pagination without claiming a clean build', async () => {
    const f = fixture([{ name: 'CI', status: 'completed', conclusion: 'failure' }]);
    const failing = await buildHealthReport(c, f.api, token); expect(failing.verdict).toBe('FAILING');
    const incompleteApi = vi.fn(async (path: string, supplied: string) => ({ ...(await f.api(path, supplied)), incomplete: path.includes('/check-runs') }));
    const incomplete = await buildHealthReport(c, incompleteApi, token); expect(incomplete).toMatchObject({ verdict: 'FAILING', incomplete: true });
  });
  it('reports failed statuses even when other checks are pending', async () => {
    const f = fixture([{ name: 'CI', status: 'in_progress', conclusion: null }], [], [{ state: 'failure', context: 'build' }]);
    expect((await buildHealthReport(c, f.api, token)).verdict).toBe('FAILING');
  });
  it('never reports cancelled checks or Actions as passing', async () => {
    for (const f of [fixture([{ status: 'completed', conclusion: 'cancelled' }]), fixture([], [{ status: 'completed', conclusion: 'cancelled' }])]) {
      expect((await buildHealthReport(c, f.api, token)).verdict).toBe('FAILING');
    }
  });
  it('blocks another repository before network I/O', async () => {
    const mockedFetch = vi.spyOn(globalThis, 'fetch');
    await expect(githubApi(c)('/repos/another/public/issues', 'token')).rejects.toThrow('Repository access denied');
    expect(mockedFetch).not.toHaveBeenCalled(); mockedFetch.mockRestore();
  });
});

/** Fixed-repository, read-only GitHub report. No arbitrary URL, repo, or method input. */
import { createPrivateKey, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface GithubConfig { owner: string; repo: string; branch: string; appId: string; installationId: string; privateKeyPath: string }
export type ApiGet = (path: string, token: string) => Promise<{ data: unknown; incomplete: boolean }>;
const slug = /^[A-Za-z0-9_.-]{1,100}$/;
const branch = /^[A-Za-z0-9_./-]{1,180}$/;
export function configFromEnv(env = process.env): GithubConfig {
  const c = { owner: env.ECHELON_GITHUB_OWNER ?? '', repo: env.ECHELON_GITHUB_REPO ?? '', branch: env.ECHELON_GITHUB_BRANCH ?? '', appId: env.ECHELON_GITHUB_APP_ID ?? '', installationId: env.ECHELON_GITHUB_INSTALLATION_ID ?? '', privateKeyPath: env.ECHELON_GITHUB_PRIVATE_KEY_PATH ?? '' };
  if (!slug.test(c.owner) || !slug.test(c.repo) || !branch.test(c.branch) || c.branch.includes('..') || !/^\d+$/.test(c.appId) || !/^\d+$/.test(c.installationId) || !c.privateKeyPath.startsWith('/')) throw new Error('GitHub provider configuration invalid');
  return c;
}
const encoded = (v: string) => encodeURIComponent(v);
function jwt(c: GithubConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const input = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat: now - 60, exp: now + 9 * 60, iss: c.appId })}`;
  const sign = createSign('RSA-SHA256'); sign.update(input); sign.end();
  return `${input}.${sign.sign(createPrivateKey(readFileSync(c.privateKeyPath))).toString('base64url')}`;
}
async function jsonGet(url: URL, token: string): Promise<{ data: unknown; incomplete: boolean }> {
  if (url.origin !== 'https://api.github.com' || url.username || url.password) throw new Error('GitHub destination denied');
  const res = await fetch(url, { method: 'GET', redirect: 'manual', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'echelon-readonly-report' }, signal: AbortSignal.timeout(10_000) });
  if (res.status >= 300 && res.status < 400) throw new Error('GitHub redirect denied');
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > 1024 * 1024) throw new Error('GitHub response too large');
  const data = await res.text();
  if (Buffer.byteLength(data) > 1024 * 1024) throw new Error('GitHub response too large');
  return { data: JSON.parse(data) as unknown, incomplete: /rel="next"/.test(res.headers.get('link') ?? '') };
}
let cached: { token: string; expires: number; identity: string } | null = null;
export async function installationToken(c: GithubConfig): Promise<string> {
  const identity = `${c.appId}/${c.installationId}/${c.owner}/${c.repo}`;
  if (cached?.identity === identity && cached.expires > Date.now() + 5 * 60_000) return cached.token;
  const url = new URL(`https://api.github.com/app/installations/${encoded(c.installationId)}/access_tokens`);
  const res = await fetch(url, { method: 'POST', redirect: 'manual', headers: { Authorization: `Bearer ${jwt(c)}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'echelon-readonly-report' }, body: JSON.stringify({ repositories: [c.repo], permissions: { contents: 'read', checks: 'read', statuses: 'read', actions: 'read', issues: 'read', pull_requests: 'read' } }), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GitHub App token request failed (${res.status})`);
  const body = await res.json() as { token?: string; expires_at?: string; repositories?: Array<{ full_name?: string }>; permissions?: Record<string, string> };
  if (!body.token || !body.expires_at || body.repositories?.length !== 1 || body.repositories[0]?.full_name?.toLowerCase() !== `${c.owner}/${c.repo}`.toLowerCase()) throw new Error('GitHub App token scope could not be verified');
  for (const key of ['contents', 'checks', 'statuses', 'actions', 'issues', 'pull_requests']) if (body.permissions?.[key] !== 'read') throw new Error('GitHub App read permission missing');
  const expires = Date.parse(body.expires_at);
  if (!Number.isFinite(expires) || expires <= Date.now() + 60_000) throw new Error('GitHub App token expiry invalid');
  cached = { token: body.token, expires, identity };
  return body.token;
}
export function githubApi(c: GithubConfig): ApiGet {
  const prefix = `/repos/${encoded(c.owner)}/${encoded(c.repo)}`;
  return async (path, token) => {
    if (!path.startsWith(prefix + '/')) throw new Error('Repository access denied');
    return jsonGet(new URL(`https://api.github.com${path}`), token);
  };
}
const arr = (v: unknown): Array<Record<string, unknown>> => Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const clean = (v: unknown, cap = 180) => typeof v === 'string' ? v.replace(/[\r\n\t]/g, ' ').slice(0, cap) : '';
/** A report is evidence metadata, never a verdict that absent checks passed. */
export async function buildHealthReport(c: GithubConfig, api: ApiGet = githubApi(c), tokenProvider: (c: GithubConfig) => Promise<string> = installationToken) {
  const token = await tokenProvider(c);
  const base = `/repos/${encoded(c.owner)}/${encoded(c.repo)}`;
  const get = (suffix: string) => api(base + suffix, token);
  const head = obj((await get(`/branches/${encoded(c.branch)}`)).data);
  const sha = clean(obj(head.commit).sha, 64);
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Branch head unavailable');
  const [checksR, statusR, actionsR, issuesR, pullsR] = await Promise.all([
    get(`/commits/${sha}/check-runs?per_page=100`), get(`/commits/${sha}/status`),
    get(`/actions/runs?head_sha=${sha}&per_page=100`), get('/issues?state=open&per_page=100'), get('/pulls?state=open&per_page=100'),
  ]);
  const checks = arr(obj(checksR.data).check_runs).map((x) => ({ name: clean(x.name), status: clean(x.status), conclusion: clean(x.conclusion), url: clean(x.html_url, 300) }));
  const statuses = arr(obj(statusR.data).statuses).map((x) => ({ context: clean(x.context), state: clean(x.state), url: clean(x.target_url, 300) }));
  const runs = arr(obj(actionsR.data).workflow_runs).map((x) => ({ name: clean(x.name), status: clean(x.status), conclusion: clean(x.conclusion), url: clean(x.html_url, 300) }));
  const issues = arr(issuesR.data).filter((x) => !x.pull_request).map((x) => ({ title: clean(x.title), url: clean(x.html_url, 300) }));
  const pulls = arr(pullsR.data).map((x) => ({ title: clean(x.title), url: clean(x.html_url, 300) }));
  const incomplete = [checksR, statusR, actionsR, issuesR, pullsR].some((x) => x.incomplete) || Number(obj(checksR.data).total_count ?? 0) > checks.length || Number(obj(actionsR.data).total_count ?? 0) > runs.length;
  const checkFailures = checks.some((x) => ['failure', 'timed_out', 'action_required', 'startup_failure'].includes(x.conclusion)) || statuses.some((x) => x.state === 'failure' || x.state === 'error') || runs.some((x) => ['failure', 'timed_out', 'action_required'].includes(x.conclusion));
  const pending = checks.some((x) => x.status !== 'completed' || !x.conclusion) || statuses.some((x) => x.state !== 'success') || runs.some((x) => x.status !== 'completed' || !x.conclusion);
  const report = { repository: `${c.owner}/${c.repo}`, branch: c.branch, commit: sha, reviewedAt: new Date().toISOString(), verdict: incomplete || pending || !checks.length && !statuses.length && !runs.length ? 'UNVERIFIED' : checkFailures ? 'FAILING' : 'PASSING_OBSERVED_CHECKS', incomplete, checks, statuses, runs, issues, pulls };
  if (Buffer.byteLength(JSON.stringify(report)) > 15_000) throw new Error('Report exceeds safe size limit');
  return report;
}

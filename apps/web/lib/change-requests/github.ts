/**
 * The only code that talks to GitHub for change requests. REST API, fine-grained token with
 * issues:write only. The token is read from env here, sent only in the Authorization header,
 * and never logged, returned or stored.
 */
import { logger } from '@/lib/logger';
import { ISSUE_LABEL } from '@/lib/change-requests/issue';

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
export const NOT_CONFIGURED = 'GitHub not configured: download the markdown instead';

export interface GithubConfig { repo: string }

/** Repo name when both env vars are set and valid. The token is not returned. */
export function githubConfig(env: Record<string, string | undefined> = process.env): GithubConfig | null {
  const repo = (env.CHANGE_REQUEST_GITHUB_REPO ?? '').trim();
  const token = (env.CHANGE_REQUEST_GITHUB_TOKEN ?? '').trim();
  if (!token || !REPO_RE.test(repo)) return null;
  return { repo };
}

export type CreateIssueResult =
  | { ok: true; url: string; number: number }
  | { ok: false; reason: 'not_configured' | 'repo_changed' | 'github_error'; error: string };

export async function createIssue(input: { title: string; body: string; expectRepo?: string }, env: Record<string, string | undefined> = process.env): Promise<CreateIssueResult> {
  const cfg = githubConfig(env);
  if (!cfg) return { ok: false, reason: 'not_configured', error: NOT_CONFIGURED };
  // The approval named a destination; if the configured one differs now, send nothing.
  if (input.expectRepo && input.expectRepo !== cfg.repo) return { ok: false, reason: 'repo_changed', error: 'Destination repository changed since approval; not sent' };
  const token = (env.CHANGE_REQUEST_GITHUB_TOKEN ?? '').trim();
  try {
    const res = await fetch(`https://api.github.com/repos/${cfg.repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'whink-change-requests',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: input.title, body: input.body, labels: [ISSUE_LABEL] }),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!res.ok) {
      logger.warn('change request github error', { status: res.status });
      return { ok: false, reason: 'github_error', error: `GitHub returned ${res.status}` };
    }
    const json = (await res.json().catch(() => null)) as { html_url?: unknown; number?: unknown } | null;
    const url = typeof json?.html_url === 'string' ? json.html_url : '';
    const number = json?.number;
    if (!url.startsWith('https://github.com/') || typeof number !== 'number' || !Number.isInteger(number)) {
      return { ok: false, reason: 'github_error', error: 'Unexpected response from GitHub' };
    }
    return { ok: true, url, number };
  } catch (e) {
    logger.warn('change request github call failed', { error: (e as Error)?.name });
    return { ok: false, reason: 'github_error', error: 'Could not reach GitHub' };
  }
}

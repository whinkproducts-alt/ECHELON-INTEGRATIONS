/** Read-only GitHub "skills" source: a fine-grained token, one fixed repo, GET only, results untrusted. */
import { isLocalOnlyMode } from '@/lib/local-only';
import { stripFakeUntrustedTags, wrapUntrustedContent } from '@/lib/content-isolation';

const slug = /^[A-Za-z0-9_.-]{1,100}$/;
export interface SkillsConfig { owner: string; repo: string; token: string }
export function skillsConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SkillsConfig {
  const c = { owner: env.ECHELON_GITHUB_SKILLS_OWNER ?? '', repo: env.ECHELON_GITHUB_SKILLS_REPO ?? '', token: env.ECHELON_GITHUB_SKILLS_TOKEN ?? '' };
  if (!slug.test(c.owner) || !slug.test(c.repo)) throw new Error('GitHub skills repository not configured');
  // Fine-grained tokens only: classic tokens (ghp_) cannot be limited to one repo or to read.
  if (!c.token.startsWith('github_pat_')) throw new Error('GitHub skills token must be a fine-grained personal access token');
  return c;
}

/** Fetch one file from the skills repo. Path is validated; the content is returned wrapped as untrusted. */
export async function readSkillFile(path: string, c: SkillsConfig = skillsConfigFromEnv(), f: typeof fetch = fetch): Promise<string> {
  if (isLocalOnlyMode()) throw new Error('GitHub is not available in Local-Only mode');
  if (!/^[A-Za-z0-9_./-]{1,200}$/.test(path) || path.split('/').some((s) => s === '..' || s === '')) throw new Error('Invalid skill path');
  const url = new URL(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}`);
  const res = await f(url, { method: 'GET', redirect: 'manual', headers: { authorization: `Bearer ${c.token}`, accept: 'application/vnd.github.raw+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'echelon-skills-readonly' }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  const text = await res.text();
  if (Buffer.byteLength(text) > 256 * 1024) throw new Error('Skill file too large');
  return wrapUntrustedContent(stripFakeUntrustedTags(text), 'github_skill', `https://github.com/${c.owner}/${c.repo}/${path}`);
}

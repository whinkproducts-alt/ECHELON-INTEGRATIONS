/**
 * What the workspace shows when it is a git work tree: files git ignores are invisible and
 * unreadable (build output, local env files, caches). Not a git repo, or a repo refused by the
 * configuration check: the deny list alone applies.
 *
 * Enumeration uses `git ls-files --cached --others --exclude-standard -z`; single-file checks use
 * `git check-ignore -q --no-index` (exit 0 = ignored). Both run through the hardened runGit.
 */
import { REPO_CONFIG_REFUSED, runGit } from '@/lib/workspace-tools/git';
import { SandboxError } from '@/lib/workspace-tools/sandbox';

const LS_MAX_BUFFER = 16 * 1024 * 1024;

/** APFS and HFS+ compare names case- and normalisation-insensitively; git (precomposeunicode) reports NFC. */
export const visibilityKey = (s: string, platform: string = process.platform): string => (platform === 'darwin' ? s.normalize('NFC').toLowerCase() : s);
const key = (s: string): string => visibilityKey(s);

export type RepoView =
  | { mode: 'none' }
  | { mode: 'git'; files: Set<string>; dirs: Set<string> };

export async function loadRepoView(root: string): Promise<RepoView> {
  const inside = await runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) {
    // A repository we refused (hostile config, git dir outside the workspace, git missing) is NOT 'no repository':
    // git-ignored secrets could not be hidden, so the file tools refuse too. Only a genuine non-repo is deny-list-only.
    if (inside.refused) throw new SandboxError('denied', inside.error ?? REPO_CONFIG_REFUSED);
    if (inside.notRepo) return { mode: 'none' };
    throw new SandboxError('denied', 'workspace listing unavailable');
  }
  if (inside.output.trim() !== 'true') return { mode: 'none' };
  const ls = await runGit(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], LS_MAX_BUFFER);
  // Fail closed: if git cannot give the full visible list, ignored files must not leak.
  if (!ls.ok || ls.truncated) throw new SandboxError('denied', 'workspace listing unavailable');
  const files = new Set<string>();
  const dirs = new Set<string>();
  for (const f of ls.output.split('\0')) {
    if (!f) continue;
    files.add(key(f));
    let i = f.lastIndexOf('/');
    while (i > 0) {
      const d = key(f.slice(0, i));
      if (dirs.has(d)) break;
      dirs.add(d);
      i = d.lastIndexOf('/');
    }
  }
  return { mode: 'git', files, dirs };
}

/** True when the entry (workspace-relative, forward slashes) may be shown under this view. */
export function isVisible(view: RepoView, rel: string, kind: 'file' | 'dir' | 'symlink'): boolean {
  if (view.mode === 'none') return true;
  if (kind === 'dir') return view.dirs.has(key(rel));
  return view.files.has(key(rel));
}

/** Refuse a path that git ignores. No-op outside a repository or in a refused one. */
export async function assertNotIgnored(root: string, rel: string): Promise<void> {
  if (rel === '.') return;
  // check-ignore rejects --literal-pathspecs, so a name that could be pathspec magic is refused instead.
  if (rel.startsWith(':') || rel.startsWith('-')) throw new SandboxError('denied', 'path could not be checked');
  const r = await runGit(root, ['check-ignore', '-q', '--no-index', '--', rel], undefined, false);
  if (r.ok) throw new SandboxError('denied', 'path is not readable (ignored by git)');
  if (r.code === 1) return; // not ignored
  if (r.refused) throw new SandboxError('denied', r.error ?? REPO_CONFIG_REFUSED);
  if (r.notRepo) return; // genuinely not a repository: deny list only
  throw new SandboxError('denied', 'path could not be checked');
}

export { REPO_CONFIG_REFUSED };

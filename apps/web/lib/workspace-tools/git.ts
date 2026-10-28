/**
 * Read-only git tools: git_status, git_diff, git_log.
 *
 * execFile only (never a shell), command 'git', cwd = the real workspace root, FIXED argument
 * lists. The only model-influenced pieces are a sandbox-validated pathspec (placed after '--')
 * and an integer N. Code execution from repository configuration is closed off in layers:
 *   - command line -c overrides for pager, fsmonitor, hooks, signatures, attributes file;
 *   - GIT_ATTR_SOURCE = the empty tree, global and system config set to /dev/null;
 *   - BEFORE every run the repo is refused if its local config defines filter.*, include.* or
 *     includeIf.* entries (clean/smudge filters run commands), or if .git/info/attributes is non-empty.
 * Output for denied paths is removed, then secret-shaped strings are redacted from everything.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeniedRelPath, isInside, resolveGitPathspec } from '@/lib/workspace-tools/sandbox';
import { redactSecrets } from '@/lib/workspace-tools/redact';
import { logger } from '@/lib/logger';

export const GIT_LIMITS = { timeoutMs: 10_000, maxBuffer: 256 * 1024, maxReturnBytes: 64 * 1024, logMax: 30 } as const;
export const REPO_CONFIG_REFUSED = 'repository configuration not allowed';
/** The well-known empty tree object: attributes are read from it, i.e. none. */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Always first. -c on the command line beats repo config, so a hostile .git/config cannot override these. */
export const GIT_SAFE_PREFIX: readonly string[] = [
  '-c', 'core.fsmonitor=false',
  '-c', 'core.pager=cat',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.attributesFile=/dev/null',
  '-c', 'log.showSignature=false',
  '-c', 'color.ui=false',
  '-c', 'core.quotepath=false',
  '--no-pager',
  '--literal-pathspecs',
];

function gitEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ATTR_SOURCE: EMPTY_TREE,
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_ATTR_NOSYSTEM: '1',
    LC_ALL: 'C',
  };
}

export interface GitOutput {
  ok: boolean;
  output: string;
  truncated: boolean;
  error?: string;
  /** Process exit code when git ran and failed. */
  code?: number;
  /** True when the repository was refused before any command ran. */
  refused?: boolean;
  /** True when git reported that the directory is not a repository. */
  notRepo?: boolean;
}

/** No absolute path in an error: the workspace becomes <workspace>, any other absolute path too. */
export function scrubPaths(text: string, root: string): string {
  const r = root.replace(/\/+$/, '');
  let out = r ? text.split(r).join('<workspace>') : text;
  out = out.replace(/(^|[\s'"(=:])\/(?:[\w.@+~-]+\/?)+/g, (_m, pre: string) => `${pre}<workspace>`);
  return out;
}

export function execGit(root: string, args: readonly string[], maxBuffer: number = GIT_LIMITS.maxBuffer, literalPathspecs = true): Promise<GitOutput> {
  return new Promise((resolve) => {
    execFile(
      'git',
      [...(literalPathspecs ? GIT_SAFE_PREFIX : GIT_SAFE_PREFIX.filter((a) => a !== '--literal-pathspecs')), ...args],
      { cwd: root, env: gitEnv() as unknown as NodeJS.ProcessEnv, timeout: GIT_LIMITS.timeoutMs, maxBuffer, encoding: 'utf8', windowsHide: true, shell: false },
      (err, stdout, stderr) => {
        const out = typeof stdout === 'string' ? stdout : '';
        const overflow = (err as NodeJS.ErrnoException | null)?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
        if (err && !overflow) {
          const killed = (err as { killed?: boolean }).killed === true;
          const code = typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : undefined;
          const text = String(stderr ?? '');
          const first = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'git is not installed' : text.trim().split('\n')[0]?.slice(0, 200) || 'git failed';
          const msg = killed ? 'git timed out' : scrubPaths(first, root);
          resolve({ ok: false, output: '', truncated: false, error: msg, code, notRepo: /not a git repository|inside a git repository/i.test(text) });
          return;
        }
        resolve({ ok: true, output: out, truncated: overflow });
      },
    );
  });
}

/**
 * Refuse a repository whose own configuration could run commands during status/diff/log:
 * any filter.*, include.* or includeIf.* config entry, or a non-empty .git/info/attributes.
 * Returns null when safe (or when this is not a repository: the real command then reports that).
 */
export async function repoConfigProblem(root: string): Promise<GitOutput | null> {
  const refused: GitOutput = { ok: false, output: '', truncated: false, error: REPO_CONFIG_REFUSED, refused: true };
  const cfg = await execGit(root, ['config', '--local', '--name-only', '--get-regexp', '^(filter|include|includeif)\\.']);
  if (cfg.ok) return refused; // exit 0: at least one match
  if (cfg.code !== 1) {
    if (cfg.notRepo) return null; // not a repository: nothing to refuse
    // Fail closed on any other error, but say why when git never ran (missing binary, timeout).
    return cfg.error ? { ...refused, error: cfg.error } : refused;
  }
  // The git directory must belong to this workspace: inside the root, or the .git DIRECTORY of an enclosing
  // repository. A `.git` FILE saying `gitdir: /elsewhere` would otherwise show a repository outside the workspace.
  const outside: GitOutput = { ...refused, error: 'repository is not inside the workspace' };
  const gd = await execGit(root, ['rev-parse', '--absolute-git-dir']);
  if (!gd.ok) return refused;
  try {
    const realRoot = await fs.realpath(root);
    const realGit = await fs.realpath(gd.output.trim());
    if (!isInside(realRoot, realGit)) {
      const top = await execGit(root, ['rev-parse', '--show-toplevel']);
      if (!top.ok) return outside;
      const realTop = await fs.realpath(top.output.trim());
      const topGit = path.join(realTop, '.git');
      const st = await fs.lstat(topGit);
      if (!isInside(realTop, realRoot) || !st.isDirectory() || (await fs.realpath(topGit)) !== realGit) return outside;
    }
  } catch {
    return outside;
  }
  const ap = await execGit(root, ['rev-parse', '--git-path', 'info/attributes']);
  if (!ap.ok) return refused;
  const file = path.resolve(root, ap.output.trim());
  try {
    const st = await fs.stat(file);
    if (st.size > 0) return refused;
  } catch { /* no such file: fine */ }
  return null;
}

/** Hardened run: repository check first, then the fixed command. */
let versionChecked = false;
/** GIT_ATTR_SOURCE needs git 2.40+. Older git ignores it silently; the filter.* refusal still applies. Warn once. */
async function warnOldGit(root: string): Promise<void> {
  if (versionChecked) return;
  versionChecked = true;
  const v = await execGit(root, ['--version']);
  const m = /git version (\d+)\.(\d+)/.exec(v.output);
  if (m && (Number(m[1]) < 2 || (Number(m[1]) === 2 && Number(m[2]) < 40))) {
    logger.warn('git older than 2.40: GIT_ATTR_SOURCE is ignored; relying on the filter/include refusal', { version: `${m[1]}.${m[2]}` });
  }
}

export async function runGit(root: string, args: readonly string[], maxBuffer: number = GIT_LIMITS.maxBuffer, literalPathspecs = true): Promise<GitOutput> {
  await warnOldGit(root);
  const problem = await repoConfigProblem(root);
  if (problem) return problem;
  return execGit(root, args, maxBuffer, literalPathspecs);
}

function finish(out: GitOutput): GitOutput {
  const redacted = redactSecrets(out.output);
  if (Buffer.byteLength(redacted, 'utf8') <= GIT_LIMITS.maxReturnBytes) return { ...out, output: redacted };
  return { ...out, output: Buffer.from(redacted, 'utf8').subarray(0, GIT_LIMITS.maxReturnBytes).toString('utf8').replace(/�$/, ''), truncated: true };
}

/** Drop status/stat lines whose path is on the deny list. */
function pathsOf(text: string): string[] {
  return text.split(/ => |\{|\}| -> /).map((s) => s.trim()).filter(Boolean);
}
const deniedText = (text: string) => pathsOf(text).some((p) => isDeniedRelPath(p));

/** Undo git's C-style path quoting ("a\tb", "\303\251"). Unquoted text is returned as is. */
export function unquoteGitPath(p: string): string {
  if (!(p.length >= 2 && p.startsWith('"') && p.endsWith('"'))) return p;
  const bytes: number[] = [];
  const body = p.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== '\\') { bytes.push(...Buffer.from(c, 'utf8')); continue; }
    const n = body[++i];
    const oct = /^[0-7]{3}/.exec(body.slice(i, i + 3));
    if (oct) { bytes.push(parseInt(oct[0], 8)); i += 2; continue; }
    const map: Record<string, number> = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '\\': 92, '"': 34 };
    bytes.push(map[n] ?? n.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Status comes from `status --short --branch -z`: NUL separated "XY path" entries, paths raw (never
 * quoted); a rename or copy is followed by one extra entry holding the old path. Rebuilt as lines.
 */
export function filterStatusZ(text: string): string {
  const parts = text.split('\0').filter((x) => x !== '');
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.startsWith('##')) { lines.push(e); continue; }
    const xy = e.slice(0, 2);
    const paths = [e.slice(3)];
    if (/[RC]/.test(xy) && i + 1 < parts.length) paths.push(parts[++i]);
    if (paths.some((p) => isDeniedRelPath(p))) continue;
    lines.push(paths.length > 1 ? `${xy} ${paths[1]} -> ${paths[0]}` : e);
  }
  return lines.join('\n') + (lines.length ? '\n' : '');
}
export function filterStatusLines(text: string): string {
  return text.split('\n').filter((l) => l.startsWith('##') || !deniedText(unquoteGitPath(l.slice(3)))).join('\n');
}
export function filterStatLines(text: string): string {
  return text.split('\n').filter((l) => {
    const i = l.indexOf(' | ');
    return i < 0 ? true : !deniedText(unquoteGitPath(l.slice(0, i).trim()));
  }).join('\n');
}

/** The two paths of a `diff --git` header (a/X b/Y). Handles spaces, braces and quoted names. */
export function parseDiffHeader(header: string): string[] {
  if (header.startsWith('"') || /^a\/.* "b\//.test(header)) {
    const m = /^("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*"|.+)$/.exec(header);
    if (m) return [unquoteGitPath(m[1]).replace(/^a\//, ''), unquoteGitPath(m[2]).replace(/^b\//, '')];
  }
  // Unquoted: "a/P b/P" for most files, so the halves are equal and the length gives the split.
  const n = (header.length - 5) / 2;
  if (Number.isInteger(n) && n > 0 && header.slice(0, 2) === 'a/' && header.slice(2 + n, 2 + n + 3) === ' b/' && header.slice(2, 2 + n) === header.slice(2 + n + 3)) {
    const p = header.slice(2, 2 + n);
    return [p, p];
  }
  // A rename: the best split is every " b/" boundary; all candidates are checked.
  const pieces = header.split(' b/');
  return [pieces[0].replace(/^a\//, ''), pieces[pieces.length - 1]];
}

/** Remove whole per-file sections of a patch for denied paths. */
export function filterPatch(text: string): string {
  const parts = text.split(/^(?=diff --git )/m);
  return parts.filter((block) => {
    if (!block.startsWith('diff --git ')) return true;
    const nl = block.indexOf('\n');
    const header = block.slice('diff --git '.length, nl < 0 ? undefined : nl);
    return !parseDiffHeader(header).some((p) => isDeniedRelPath(p));
  }).join('');
}

export async function gitStatusTool(root: string): Promise<GitOutput> {
  const r = await runGit(root, ['status', '--short', '--branch', '-z', '--', '.']);
  return r.ok ? finish({ ...r, output: filterStatusZ(r.output) }) : r;
}

export async function gitDiffTool(root: string, input: { path?: string; patch?: boolean }): Promise<GitOutput> {
  // Plain `git diff` omits staged changes. Compare the work tree with HEAD; in a repo with no commit yet, show the index.
  const head = await runGit(root, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']);
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--relative', input.patch === true ? '--patch' : '--stat', ...(head.ok ? ['HEAD'] : ['--cached'])];
  if (input.path !== undefined) {
    const rel = await resolveGitPathspec(root, input.path);
    args.push('--', rel);
  }
  const r = await runGit(root, args);
  if (!r.ok) return r;
  return finish({ ...r, output: input.patch === true ? filterPatch(r.output) : filterStatLines(r.output) });
}

export async function gitLogTool(root: string, input: { n?: number }): Promise<GitOutput> {
  const n = input.n ?? 10;
  if (!Number.isInteger(n) || n < 1 || n > GIT_LIMITS.logMax) {
    return { ok: false, output: '', truncated: false, error: `n must be an integer from 1 to ${GIT_LIMITS.logMax}` };
  }
  const r = await runGit(root, ['log', '--oneline', '-n', String(n)]);
  return r.ok ? finish(r) : r;
}

/**
 * Workspace sandbox: path resolution and the deny list for the read-only workspace tools.
 *
 * Rules (all enforced here, in one place):
 * - Every path is resolved with fs.realpath and must sit inside realpath(WHINK_WORKSPACE_ROOT),
 *   compared by path segments (a sibling like /work/app-evil is NOT inside /work/app).
 * - Paths given to tools are workspace-relative. Absolute paths are accepted only when they
 *   resolve inside the root. NUL bytes, '..' escapes and symlinks that leave the root are refused.
 * - A deny list applies to the requested path AND to the resolved real path, so a symlink with an
 *   innocent name that points at a secret is refused too.
 * Pure helpers plus fs.realpath/stat. No process.env reads here.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_PATH_LENGTH = 1024;

export class SandboxError extends Error {
  constructor(public readonly code: 'invalid_path' | 'outside_root' | 'denied' | 'not_found' | 'not_a_file' | 'not_a_directory' | 'bad_root', message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

/** Directory names never entered, listed, searched or read. */
const DENIED_DIRS: ReadonlySet<string> = new Set([
  '.git', '.ssh', '.aws', '.docker', '.kube', '.gnupg', '.terraform', 'node_modules', '.next',
]);

/** File name rules, matched on the normalised, lower-cased base name. */
const DENIED_FILE_RES: readonly RegExp[] = [
  /^\.env$/,
  /^\.env\..+$/, // .env.local, .env.production ... (.env.example is allowed below)
  /\.env$/, // prod.env, staging.env
  /^\.envrc$/,
  /^\.git-credentials$/,
  /\.(pem|key|p12|pfx|jks|keystore)$/,
  /^\.pypirc$/,
  /^\.npmrc$/,
  /^\.netrc$/,
  /^\.pgpass$/,
  /^credentials$/,
  /^credentials\.(json|ya?ml|ini|xml)(\..*|~)?$/,
  /credentials.*\.json$/,
  /^service-account.*\.json$/,
  /\.tfstate/,
  /^\.dev\.vars$/,
  /^secrets\./,
];
const ALLOWED_FILE_EXCEPTIONS: ReadonlySet<string> = new Set(['.env.example']);

/** Unicode and trailing dot/space variants of a name, lower-cased. NFC, NFD and NFKC all count. */
function nameVariants(segment: string): string[] {
  const out = new Set<string>();
  for (const form of ['NFC', 'NFD', 'NFKC'] as const) {
    const v = segment.normalize(form).toLowerCase().replace(/[. \u00A0]+$/g, '');
    out.add(v);
    // Zero-width and format characters are stripped too.
    out.add(v.replace(/[\u200B-\u200F\u2060\uFEFF\u00AD]/g, ''));
  }
  return [...out];
}

/** True when a single path segment is a denied file or directory name. */
export function isDeniedName(segment: string): boolean {
  return nameVariants(segment).some((s) => {
    if (DENIED_DIRS.has(s)) return true;
    if (ALLOWED_FILE_EXCEPTIONS.has(s)) return false;
    // Private key files: id_rsa, id_dsa, id_ecdsa, id_ed25519 with any suffix except .pub.
    // (id_utils.ts and similar source files are not keys.)
    if (/^id_(rsa|dsa|ecdsa|ed25519)/.test(s) && !s.endsWith('.pub')) return true;
    return DENIED_FILE_RES.some((re) => re.test(s));
  });
}

/** True when any segment of a workspace-relative path is denied. */
export function isDeniedRelPath(rel: string): boolean {
  const segs = rel.split(/[\\/]+/).filter((s) => s && s !== '.');
  if (segs.some(isDeniedName)) return true;
  // .claude/settings.local.json (local permission overrides) as a two-segment rule.
  for (let i = 0; i + 1 < segs.length; i++) {
    if (nameVariants(segs[i]).includes('.claude') && nameVariants(segs[i + 1]).includes('settings.local.json')) return true;
  }
  return false;
}

/** Segment-safe containment: equal to root, or strictly below it. */
export function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith('..' + path.sep);
}

/** Resolve the configured root to its real path. It must be an absolute existing directory. */
export async function resolveRoot(rootEnv: string | undefined): Promise<string> {
  if (!rootEnv || !path.isAbsolute(rootEnv) || rootEnv.includes('\0')) throw new SandboxError('bad_root', 'workspace root must be an absolute path');
  let real: string;
  try {
    real = await fs.realpath(rootEnv);
    if (!(await fs.stat(real)).isDirectory()) throw new Error('not a directory');
  } catch {
    throw new SandboxError('bad_root', 'workspace root does not exist or is not a directory');
  }
  return real;
}

export interface ResolvedPath {
  /** Real absolute path (symlinks resolved). */
  abs: string;
  /** Workspace-relative path with forward slashes ('.' for the root). */
  rel: string;
}

function toRel(root: string, abs: string): string {
  const rel = path.relative(root, abs);
  return rel === '' ? '.' : rel.split(path.sep).join('/');
}

function checkInput(input: unknown): string {
  if (typeof input !== 'string') throw new SandboxError('invalid_path', 'path must be a string');
  if (input.length === 0 || input.length > MAX_PATH_LENGTH) throw new SandboxError('invalid_path', 'path length is out of range');
  if (input.includes('\0')) throw new SandboxError('invalid_path', 'path contains a null byte');
  if (input.includes('\\')) throw new SandboxError('invalid_path', 'path must use forward slashes');
  return input;
}

/** Lexical resolution against the root, with containment checked before touching the disk. */
function lexical(root: string, input: string): string {
  const abs = path.resolve(root, input);
  if (!isInside(root, abs)) throw new SandboxError('outside_root', 'path is outside the workspace');
  return abs;
}

/**
 * Resolve an existing path. `root` must already be a realpath (see resolveRoot).
 * Throws SandboxError with a safe message; messages never echo file contents.
 */
export async function resolveWorkspacePath(root: string, input: unknown): Promise<ResolvedPath> {
  const raw = checkInput(input);
  const lex = lexical(root, raw);
  if (isDeniedRelPath(toRel(root, lex))) throw new SandboxError('denied', 'path is not readable (deny list)');
  let real: string;
  try {
    real = await fs.realpath(lex);
  } catch {
    throw new SandboxError('not_found', 'path not found');
  }
  if (!isInside(root, real)) throw new SandboxError('outside_root', 'path resolves outside the workspace');
  const rel = toRel(root, real);
  if (isDeniedRelPath(rel)) throw new SandboxError('denied', 'path is not readable (deny list)');
  return { abs: real, rel };
}

/**
 * Validate a path for use as a git pathspec. It may no longer exist (a deleted file can still be
 * diffed), so an existing path is fully resolved and a missing one is checked lexically, with its
 * nearest existing ancestor resolved to catch symlink escapes. Returns the clean relative path.
 */
export async function resolveGitPathspec(root: string, input: unknown): Promise<string> {
  const raw = checkInput(input);
  const lex = lexical(root, raw);
  const rel = toRel(root, lex);
  if (isDeniedRelPath(rel)) throw new SandboxError('denied', 'path is not readable (deny list)');
  let probe = lex;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      if (!isInside(root, real)) throw new SandboxError('outside_root', 'path resolves outside the workspace');
      if (isDeniedRelPath(toRel(root, real))) throw new SandboxError('denied', 'path is not readable (deny list)');
      break;
    } catch (e) {
      if (e instanceof SandboxError) throw e;
      const parent = path.dirname(probe);
      if (parent === probe || !isInside(root, parent)) break;
      probe = parent;
    }
  }
  // Pathspec magic (":(top)", ":!x") and option-like names are refused outright.
  if (rel.startsWith(':') || rel.startsWith('-')) throw new SandboxError('invalid_path', 'path may not start with ":" or "-"');
  return rel;
}

export async function requireFile(p: ResolvedPath): Promise<import('node:fs').Stats> {
  const st = await fs.stat(p.abs);
  if (!st.isFile()) throw new SandboxError('not_a_file', 'path is not a regular file');
  return st;
}

export async function requireDirectory(p: ResolvedPath): Promise<void> {
  const st = await fs.stat(p.abs);
  if (!st.isDirectory()) throw new SandboxError('not_a_directory', 'path is not a directory');
}

/**
 * Check one directory entry found while walking. Returns the safe entry kind, or null when the
 * entry must be skipped (denied name, or a symlink that leaves the root or hits the deny list).
 * Symlinks are reported as 'symlink' and never followed by walkers.
 */
export async function classifyEntry(
  root: string,
  dirAbs: string,
  dirent: { name: string; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean },
): Promise<'file' | 'dir' | 'symlink' | null> {
  if (isDeniedName(dirent.name)) return null;
  if (dirent.isSymbolicLink()) {
    try {
      const real = await fs.realpath(path.join(dirAbs, dirent.name));
      if (!isInside(root, real) || isDeniedRelPath(toRel(root, real))) return null;
      return 'symlink';
    } catch {
      return null;
    }
  }
  if (dirent.isDirectory()) return 'dir';
  if (dirent.isFile()) return 'file';
  return null;
}

export { toRel };

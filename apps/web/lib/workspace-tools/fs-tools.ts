/**
 * Read-only filesystem tools: read_file, list_files, search_files.
 * Every path goes through the sandbox. Output is capped and secret-shaped strings are redacted.
 * The caller (index.ts) treats all results as untrusted external content.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { redactSecrets } from '@/lib/workspace-tools/redact';
import { assertNotIgnored, isVisible, loadRepoView } from '@/lib/workspace-tools/repo-view';
import { constants as fsc } from 'node:fs';
import {
  SandboxError, classifyEntry, isDeniedName, isInside, requireDirectory, requireFile, resolveWorkspacePath, toRel,
} from '@/lib/workspace-tools/sandbox';

export const LIMITS = {
  readMaxBytesReturned: 64 * 1024,
  readMaxFileBytes: 5 * 1024 * 1024,
  readDefaultLines: 2000,
  readMaxLines: 5000,
  listMaxEntries: 500,
  listMaxDepth: 4,
  searchMaxPatternLength: 200,
  searchMaxMatches: 100,
  searchMatchLineChars: 300,
  searchMaxFilesScanned: 2000,
  searchMaxFileBytes: 1024 * 1024,
  searchLineScanChars: 1000,
  searchPerFileBudgetMs: 50,
  searchTotalBudgetMs: 3000,
} as const;

export { redactSecrets };

function looksBinary(buf: Buffer): boolean {
  return buf.includes(0);
}

/** A PEM private key header. A file containing one is refused whole: a slice or a search hit could miss the header and leak the body. */
export const PRIVATE_KEY_HEADER = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;

export function sameFile(a: { dev: number | bigint; ino: number | bigint }, b: { dev: number | bigint; ino: number | bigint }): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

/**
 * Read a regular file without following a symlink at the final component (O_NOFOLLOW), then
 * confirm the path still resolves inside the root to the very same file (dev and ino of the open
 * handle against the resolved path). A swap between resolution and read is refused.
 * `beforeRecheck` exists only so tests can swap the path between the read and the re-check.
 */
export async function readChecked(
  root: string,
  abs: string,
  maxBytes: number,
  beforeRecheck?: () => Promise<void> | void,
): Promise<{ buf: Buffer; size: number }> {
  let fh;
  try {
    fh = await fs.open(abs, fsc.O_RDONLY | (fsc.O_NOFOLLOW ?? 0));
  } catch {
    throw new SandboxError('denied', 'file changed while reading; refused');
  }
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw new SandboxError('not_a_file', 'path is not a regular file');
    // A second hard link may be a denied file under an innocent name (the path check cannot see that). Fail closed:
    // a legitimately hard-linked file is refused too.
    if (st.nlink > 1) throw new SandboxError('denied', 'file has more than one hard link; refused');
    if (st.size > maxBytes) return { buf: Buffer.alloc(0), size: st.size };
    const buf = await fh.readFile();
    if (beforeRecheck) await beforeRecheck();
    let real: string;
    try { real = await fs.realpath(abs); } catch { throw new SandboxError('denied', 'file changed while reading; refused'); }
    if (!isInside(root, real)) throw new SandboxError('outside_root', 'path resolves outside the workspace');
    const now = await fs.stat(real);
    if (!sameFile(st, now)) throw new SandboxError('denied', 'file changed while reading; refused');
    return { buf, size: st.size };
  } finally {
    await fh.close();
  }
}

export interface ReadFileResult {
  path: string;
  content: string;
  truncated: boolean;
  start_line: number;
  end_line: number;
  total_lines: number;
}

export async function readFileTool(root: string, input: { path: string; start_line?: number; line_count?: number }): Promise<ReadFileResult> {
  const p = await resolveWorkspacePath(root, input.path);
  await requireFile(p);
  await assertNotIgnored(root, p.rel);
  const { buf, size } = await readChecked(root, p.abs, LIMITS.readMaxFileBytes);
  if (size > LIMITS.readMaxFileBytes) throw new SandboxError('invalid_path', 'file is larger than 5 MB');
  if (looksBinary(buf)) throw new SandboxError('invalid_path', 'binary file refused (contains a NUL byte)');
  if (PRIVATE_KEY_HEADER.test(buf.toString('utf8'))) throw new SandboxError('denied', 'file contains a private key; not readable');
  // Strip a BOM and the CR of CRLF so the model sees clean lines.
  const lines = buf.toString('utf8').replace(/^\uFEFF/, '').split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const start = Math.max(1, input.start_line ?? 1);
  const count = Math.min(LIMITS.readMaxLines, Math.max(1, input.line_count ?? LIMITS.readDefaultLines));
  const slice = lines.slice(start - 1, start - 1 + count);
  // Redact BEFORE the byte cut, so a secret straddling the limit cannot leave a readable prefix.
  let content = redactSecrets(slice.join('\n'));
  let truncated = start - 1 + slice.length < lines.length;
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.length > LIMITS.readMaxBytesReturned) {
    content = bytes.subarray(0, LIMITS.readMaxBytesReturned).toString('utf8').replace(/�$/, '');
    truncated = true;
  }
  const returnedLines = content === '' ? 0 : content.split('\n').length;
  return {
    path: p.rel,
    content,
    truncated,
    start_line: start,
    end_line: start + returnedLines - 1,
    total_lines: lines.length,
  };
}

export interface ListEntry { path: string; type: 'file' | 'dir' | 'symlink' }
export interface ListFilesResult { path: string; entries: ListEntry[]; truncated: boolean }

export async function listFilesTool(root: string, input: { path?: string; depth?: number }): Promise<ListFilesResult> {
  const p = await resolveWorkspacePath(root, input.path ?? '.');
  await requireDirectory(p);
  await assertNotIgnored(root, p.rel);
  const view = await loadRepoView(root);
  const maxDepth = Math.min(LIMITS.listMaxDepth, Math.max(1, input.depth ?? 1));
  const entries: ListEntry[] = [];
  let truncated = false;
  const queue: Array<{ abs: string; depth: number }> = [{ abs: p.abs, depth: 1 }];
  while (queue.length > 0 && !truncated) {
    const cur = queue.shift()!;
    let dirents;
    try { dirents = await fs.readdir(cur.abs, { withFileTypes: true }); } catch { continue; }
    dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const d of dirents) {
      const kind = await classifyEntry(root, cur.abs, d);
      if (!kind) continue;
      if (!isVisible(view, toRel(root, path.join(cur.abs, d.name)), kind)) continue;
      if (entries.length >= LIMITS.listMaxEntries) { truncated = true; break; }
      const abs = path.join(cur.abs, d.name);
      entries.push({ path: toRel(root, abs), type: kind });
      if (kind === 'dir' && cur.depth < maxDepth) queue.push({ abs, depth: cur.depth + 1 });
    }
  }
  return { path: p.rel, entries, truncated };
}

// ── search ────────────────────────────────────────────────────────────────────

export interface SearchMatch { path: string; line: number; text: string }
export interface SearchFilesResult {
  pattern: string;
  matches: SearchMatch[];
  files_scanned: number;
  truncated: boolean;
  /** Why the result is incomplete: match_cap, file_cap, time_budget or line_time_budget. */
  truncated_reason?: string;
}

export async function searchFilesTool(
  root: string,
  input: { pattern: string; path?: string; ignore_case?: boolean },
): Promise<SearchFilesResult> {
  const pattern = input.pattern;
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > LIMITS.searchMaxPatternLength || pattern.includes('\0')) {
    throw new SandboxError('invalid_path', `pattern must be 1 to ${LIMITS.searchMaxPatternLength} characters`);
  }
  // Literal substring search only. There is no regex mode: nothing here can backtrack.
  let test: (line: string) => boolean;
  if (input.ignore_case) {
    const needle = pattern.toLowerCase();
    test = (line) => line.toLowerCase().includes(needle);
  } else {
    test = (line) => line.includes(pattern);
  }

  const start = await resolveWorkspacePath(root, input.path ?? '.');
  await assertNotIgnored(root, start.rel);
  const view = await loadRepoView(root);
  const matches: SearchMatch[] = [];
  let scanned = 0;
  let truncated = false;
  let reason: string | undefined;
  const t0 = Date.now();
  const cut = (why: string) => { truncated = true; reason ??= why; };

  const scanFile = async (abs: string): Promise<void> => {
    scanned++;
    let buf: Buffer;
    try {
      const r = await readChecked(root, abs, LIMITS.searchMaxFileBytes);
      if (r.size > LIMITS.searchMaxFileBytes) return;
      buf = r.buf;
    } catch { return; }
    if (looksBinary(buf)) return;
    const whole = buf.toString('utf8');
    if (PRIVATE_KEY_HEADER.test(whole)) return; // skipped whole: no hit from inside a key block can leak
    const fileStart = Date.now();
    const lines = whole.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (Date.now() - fileStart > LIMITS.searchPerFileBudgetMs) { cut('file_time_budget'); return; }
      const line = lines[i].replace(/\r$/, '').slice(0, LIMITS.searchLineScanChars);
      if (!test(line)) continue;
      if (matches.length >= LIMITS.searchMaxMatches) { cut('match_cap'); return; }
      matches.push({ path: toRel(root, abs), line: i + 1, text: redactSecrets(line.slice(0, LIMITS.searchMatchLineChars)) });
    }
  };

  const startSt = await fs.stat(start.abs);
  if (startSt.isFile()) {
    await scanFile(start.abs);
  } else {
    const stack = [start.abs];
    walk: while (stack.length > 0) {
      const dir = stack.pop()!;
      let dirents;
      try { dirents = await fs.readdir(dir, { withFileTypes: true }); } catch { continue; }
      dirents.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
      for (const d of dirents) {
        if (isDeniedName(d.name)) continue;
        // Symlinks are never followed during a search.
        if (d.isSymbolicLink()) continue;
        const abs = path.join(dir, d.name);
        if (d.isDirectory()) { if (isVisible(view, toRel(root, abs), 'dir')) stack.push(abs); continue; }
        if (!d.isFile()) continue;
        if (!isVisible(view, toRel(root, abs), 'file')) continue;
        if (scanned >= LIMITS.searchMaxFilesScanned) { cut('file_cap'); break walk; }
        if (Date.now() - t0 > LIMITS.searchTotalBudgetMs) { cut('time_budget'); break walk; }
        await scanFile(abs);
        if (matches.length >= LIMITS.searchMaxMatches) { cut('match_cap'); break walk; }
      }
    }
  }
  return { pattern, matches, files_scanned: scanned, truncated, ...(reason ? { truncated_reason: reason } : {}) };
}

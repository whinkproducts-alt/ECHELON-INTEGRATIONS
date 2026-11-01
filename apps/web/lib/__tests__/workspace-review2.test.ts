/** Second review round: S1, S3, E1-E6, E8, T1. Real temp directories and real git. */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const execCalls: Array<{ file: string; args: string[]; opts: any }> = [];
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execFile: ((file: string, args: string[], opts: any, cb: any) => {
      execCalls.push({ file, args, opts });
      return (actual.execFile as any)(file, args, opts, cb);
    }) as any,
  };
});

import { listFilesTool, readFileTool, searchFilesTool } from '../workspace-tools/fs-tools';
import { EMPTY_TREE, gitDiffTool, gitLogTool, gitStatusTool, parseDiffHeader, scrubPaths, unquoteGitPath, filterPatch, filterStatusZ } from '../workspace-tools/git';
import { visibilityKey } from '../workspace-tools/repo-view';
import { capToolResult, runWorkspaceTool, toolResultMaxChars } from '../workspace-tools';

let base: string;
const clean = { PATH: process.env.PATH!, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } as unknown as NodeJS.ProcessEnv;
function repo(name: string, initial = true) {
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  const run = (...a: string[]) => execFileSync('git', a, { cwd: dir, env: clean, stdio: 'pipe' }).toString();
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 'T');
  run('config', 'commit.gpgsign', 'false');
  if (initial) {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'bee\n');
    run('add', '.');
    run('commit', '-q', '-m', 'first');
  }
  return { dir, run };
}
const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as Error).message; } };

beforeAll(() => { base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ws-r2-'))); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

describe('S1: a refused repository makes the file tools refuse too', () => {
  it('git-ignored secrets are not readable, listed or searchable when the repo config is refused', async () => {
    const { dir, run } = repo('s1');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'local-secrets.yaml\n');
    fs.writeFileSync(path.join(dir, 'local-secrets.yaml'), 'token: SECRETVALUE123\n');
    run('add', '.gitignore');
    // Control: before the hostile config, the ignored file is refused by the ignore rule.
    expect(await code(readFileTool(dir, { path: 'local-secrets.yaml' }))).toMatch(/ignored by git/);
    run('config', 'filter.evil.clean', 'cat');
    for (const call of [
      () => readFileTool(dir, { path: 'local-secrets.yaml' }),
      () => readFileTool(dir, { path: 'a.txt' }),
      () => listFilesTool(dir, {}),
      () => searchFilesTool(dir, { pattern: 'SECRETVALUE' }),
    ]) {
      expect(await code(call())).toBe('repository configuration not allowed');
    }
  });
  it('through the tool entry point the error is the same and nothing is returned', async () => {
    const { dir, run } = repo('s1b');
    run('config', 'include.path', '/dev/null');
    vi.stubEnv('WHINK_LOCAL_AGENT_TOOLS', 'true');
    vi.stubEnv('WHINK_WORKSPACE_ROOT', dir);
    const r = await runWorkspaceTool('read_file', { path: 'a.txt' });
    vi.unstubAllEnvs();
    expect(r).toEqual({ success: false, error: 'repository configuration not allowed' });
  });
  it('a workspace that is not a repository keeps deny-list-only behaviour', async () => {
    const dir = path.join(base, 'plain');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'x.txt'), 'plain text');
    expect((await readFileTool(dir, { path: 'x.txt' })).content).toBe('plain text');
    expect((await listFilesTool(dir, {})).entries.map((e) => e.path)).toContain('x.txt');
  });
});

describe('S3: the git directory must belong to the workspace', () => {
  it('a .git FILE pointing to an outside repository is refused', async () => {
    const outside = repo('s3-outside');
    const ws = path.join(base, 's3-ws');
    fs.mkdirSync(ws);
    fs.writeFileSync(path.join(ws, '.git'), `gitdir: ${path.join(outside.dir, '.git')}\n`);
    for (const r of [await gitLogTool(ws, { n: 3 }), await gitStatusTool(ws)]) {
      expect(r.ok).toBe(false);
      expect(r.error).toBe('repository is not inside the workspace');
      expect(r.output).toBe('');
    }
    expect(await code(readFileTool(ws, { path: '.git' }))).toMatch(/deny list|not inside/);
  });
  it('a workspace that is a subdirectory of a repository is still allowed', async () => {
    const { dir } = repo('s3-nested');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub/f.txt'), 'x');
    const r = await gitLogTool(path.join(dir, 'sub'), { n: 2 });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('first');
  });
  it('a .git file pointing inside the workspace is allowed', async () => {
    const { dir } = repo('s3-inside');
    fs.renameSync(path.join(dir, '.git'), path.join(dir, 'gitstore'));
    fs.writeFileSync(path.join(dir, '.git'), 'gitdir: ./gitstore\n');
    expect((await gitLogTool(dir, { n: 1 })).ok).toBe(true);
  });
});

describe('E2: git_diff sees staged and unstaged changes', () => {
  it('staged only, unstaged only, and both', async () => {
    const { dir, run } = repo('e2');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\nstaged\n');
    run('add', 'a.txt');
    let r = await gitDiffTool(dir, {});
    expect(r.output).toContain('a.txt');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'bee\nunstaged\n');
    r = await gitDiffTool(dir, { patch: true });
    expect(r.output).toContain('+staged');
    expect(r.output).toContain('+unstaged');
  });
  it('a repository with no commit yet shows the staged files', async () => {
    const { dir, run } = repo('e2-empty', false);
    fs.writeFileSync(path.join(dir, 'new.txt'), 'brand new\n');
    run('add', 'new.txt');
    const r = await gitDiffTool(dir, { patch: true });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('+brand new');
    expect((await gitDiffTool(dir, {})).output).toContain('new.txt');
  });
});

describe('E3, E4, E8: reading and searching', () => {
  it('E3: a secret straddling the 64 KB cut leaves no prefix', async () => {
    const dir = path.join(base, 'e3');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'f.txt'), 'A'.repeat(65536 - 12) + ' sk-ant-' + 'b'.repeat(40) + ' tail\n');
    const r = await readFileTool(dir, { path: 'f.txt' });
    expect(r.content).not.toContain('sk-ant');
    expect(r.content).not.toContain('bbbb');
    expect(r.truncated).toBe(true);
  });
  it('E4: hitting the per-file time budget sets truncated and says why', async () => {
    const dir = path.join(base, 'e4');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'f.txt'), 'hit\n'.repeat(50));
    let t = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => (t += 100));
    try {
      const r = await searchFilesTool(dir, { pattern: 'hit' });
      expect(r.truncated).toBe(true);
      expect(r.truncated_reason).toBe('file_time_budget');
    } finally { spy.mockRestore(); }
  });
  it('E8: a BOM and CRLF are normalised in read_file and in search lines', async () => {
    const dir = path.join(base, 'e8');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'w.txt'), '﻿line one\r\nline two\r\n');
    const r = await readFileTool(dir, { path: 'w.txt' });
    expect(r.content).toBe('line one\nline two');
    expect(r.content).not.toMatch(/\r|﻿/);
    const s = await searchFilesTool(dir, { pattern: 'line two' });
    expect(s.matches[0].text).toBe('line two');
  });
  it('E8: git names with spaces and braces are handled in status, stat and patch', async () => {
    const { dir } = repo('e8git');
    const weird = 'a b {x}.txt';
    fs.writeFileSync(path.join(dir, weird), 'v1\n');
    execFileSync('git', ['add', weird], { cwd: dir, env: clean });
    execFileSync('git', ['commit', '-q', '-m', 'weird'], { cwd: dir, env: clean });
    fs.writeFileSync(path.join(dir, weird), 'v2\n');
    fs.writeFileSync(path.join(dir, '.env.local'), 'S=1\n');
    expect((await gitStatusTool(dir)).output).toContain(weird);
    expect((await gitStatusTool(dir)).output).not.toContain('.env.local');
    expect((await gitDiffTool(dir, {})).output).toContain(weird);
    const patch = (await gitDiffTool(dir, { patch: true })).output;
    expect(patch).toContain('+v2');
  });
  it('E8: quoted git paths are unquoted before the deny check', () => {
    expect(unquoteGitPath('"\\303\\251.txt"')).toBe('é.txt');
    expect(unquoteGitPath('"a\\tb\\"c"')).toBe('a\tb"c');
    expect(unquoteGitPath('plain')).toBe('plain');
    expect(parseDiffHeader('"a/x\\ty.env" "b/x\\ty.env"')).toEqual(['x\ty.env', 'x\ty.env']);
    expect(parseDiffHeader('a/a b {x}.txt b/a b {x}.txt')).toEqual(['a b {x}.txt', 'a b {x}.txt']);
    const patch = 'diff --git "a/s\\tecret.env" "b/s\\tecret.env"\n+KEY=1\ndiff --git a/ok.txt b/ok.txt\n+fine\n';
    expect(filterPatch(patch)).toBe('diff --git a/ok.txt b/ok.txt\n+fine\n');
    expect(filterStatusZ('## main\0 M a b {x}.txt\0?? .env.local\0R  new.txt\0old name.txt\0')).toBe('## main\n M a b {x}.txt\nR  old name.txt -> new.txt\n');
  });
});

describe('E5: macOS key normalisation', () => {
  it('on darwin names compare NFC and case-insensitively; elsewhere they are exact', () => {
    expect(visibilityKey('Src/Readme.MD', 'darwin')).toBe(visibilityKey('src/readme.md', 'darwin'));
    expect(visibilityKey('café.txt', 'darwin')).toBe(visibilityKey('café.txt', 'darwin'));
    expect(visibilityKey('Src/Readme.MD', 'linux')).not.toBe(visibilityKey('src/readme.md', 'linux'));
    expect(visibilityKey('café.txt', 'linux')).not.toBe(visibilityKey('café.txt', 'linux'));
  });
});

describe('E6: error wording and paths', () => {
  it('says git is not installed when the binary is missing, not "configuration not allowed"', async () => {
    const { dir } = repo('e6');
    vi.stubEnv('PATH', '/nonexistent-bin-dir');
    try {
      const r = await gitStatusTool(dir);
      expect(r.ok).toBe(false);
      expect(r.error).toBe('git is not installed');
    } finally { vi.unstubAllEnvs(); }
  });
  it('replaces absolute paths with <workspace>', () => {
    const msg = scrubPaths("fatal: detected dubious ownership in repository at '/tmp/x/y/z'", '/tmp/x/y/z');
    expect(msg).toContain('<workspace>');
    expect(msg).not.toContain('/tmp');
    expect(scrubPaths('cannot open /etc/passwd now', '/work')).toBe('cannot open <workspace> now');
  });
  it('a real git failure never echoes the workspace path', async () => {
    const { dir } = repo('e6b');
    const r = await gitLogTool(dir, { n: 99 });
    expect(JSON.stringify(r)).not.toContain(dir);
  });
});

describe('E1: a tool result is capped for the model context', () => {
  it('cuts content and points at start_line and line_count', () => {
    const data = { path: 'big.txt', content: 'x'.repeat(40000), truncated: false, start_line: 1, end_line: 1, total_lines: 1 };
    const out = capToolResult('read_file', data, 16000) as any;
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(16000 + 200);
    expect(out.truncated).toBe(true);
    expect(out.hint).toMatch(/start_line.*line_count/);
  });
  it('drops the tail of lists and honours WHINK_TOOL_RESULT_MAX_CHARS', () => {
    const entries = Array.from({ length: 1000 }, (_, i) => ({ path: `dir/file-${i}.txt`, type: 'file' }));
    const out = capToolResult('list_files', { path: '.', entries, truncated: false }, 2000) as any;
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(2000);
    expect(out.entries.length).toBeLessThan(1000);
    expect(out.truncated).toBe(true);
    expect(toolResultMaxChars({ WHINK_TOOL_RESULT_MAX_CHARS: '5000' } as any)).toBe(5000);
    expect(toolResultMaxChars({} as any)).toBe(16000);
    expect(toolResultMaxChars({ WHINK_TOOL_RESULT_MAX_CHARS: 'abc' } as any)).toBe(16000);
  });
  it('through the tool entry point a large read_file stays under the cap', async () => {
    const dir = path.join(base, 'e1');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'big.txt'), ('word '.repeat(19) + '\n').repeat(2000));
    vi.stubEnv('WHINK_LOCAL_AGENT_TOOLS', 'true');
    vi.stubEnv('WHINK_WORKSPACE_ROOT', dir);
    const r = await runWorkspaceTool('read_file', { path: 'big.txt' });
    vi.unstubAllEnvs();
    expect(r.success).toBe(true);
    expect(JSON.stringify(r.data).length).toBeLessThan(16300);
    expect((r.data as any).truncated).toBe(true);
  });
});

describe('T1: the hardening is really passed to git (fails when any piece is removed)', () => {
  it('every git run carries the attribute and config protections in its args and env', async () => {
    const { dir } = repo('t1');
    execCalls.length = 0;
    await gitStatusTool(dir);
    await gitDiffTool(dir, { patch: true });
    await gitLogTool(dir, { n: 2 });
    expect(execCalls.length).toBeGreaterThanOrEqual(6);
    for (const c of execCalls) {
      expect(c.file).toBe('git');
      expect(c.opts.shell).toBe(false);
      const a = c.args.join(' ');
      for (const must of ['core.attributesFile=/dev/null', 'core.fsmonitor=false', 'core.pager=cat', 'core.hooksPath=/dev/null', 'log.showSignature=false', '--no-pager']) expect(a, must).toContain(must);
      expect(c.opts.env).toMatchObject({
        GIT_ATTR_SOURCE: EMPTY_TREE,
        GIT_ATTR_NOSYSTEM: '1',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
      });
      expect(Object.keys(c.opts.env).sort()).toEqual(['GIT_ATTR_NOSYSTEM', 'GIT_ATTR_SOURCE', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_SYSTEM', 'GIT_OPTIONAL_LOCKS', 'GIT_TERMINAL_PROMPT', 'LC_ALL', 'PATH']);
    }
    const diff = execCalls.find((c) => c.args.includes('--patch'))!;
    expect(diff.args).toEqual(expect.arrayContaining(['--no-ext-diff', '--no-textconv']));
  });
});

describe('M1: a private key cannot leak through a partial read or a search', () => {
  const body = ['-----BEGIN ' + 'OPENSSH PRIVATE KEY-----', 'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZWQyNTUxOQ', 'AAAAIKEYBODYLINEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '-----END ' + 'OPENSSH PRIVATE KEY-----', 'tail'].join('\n') + '\n';
  it('read_file with start_line past the header refuses the file instead of returning the body', async () => {
    const dir = path.join(base, 'm1');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'key.txt'), body);
    const err = await code(readFileTool(dir, { path: 'key.txt', start_line: 2, line_count: 2 }));
    expect(err).toBe('file contains a private key; not readable');
    expect(await code(readFileTool(dir, { path: 'key.txt' }))).toBe('file contains a private key; not readable');
  });
  it('search_files skips the file, so no line of the key body is a hit', async () => {
    const dir = path.join(base, 'm1s');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'key.txt'), body);
    fs.writeFileSync(path.join(dir, 'other.txt'), 'AAAA in an ordinary file\n');
    const r = await searchFilesTool(dir, { pattern: 'AAAA' });
    expect(r.matches.map((m) => m.path)).toEqual(['other.txt']);
    expect(JSON.stringify(r)).not.toContain('KEYBODY');
  });
  it('an ordinary file that merely mentions the word is still readable', async () => {
    const dir = path.join(base, 'm1ok');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'doc.md'), 'Never commit a PRIVATE KEY to git.\n');
    expect((await readFileTool(dir, { path: 'doc.md' })).content).toContain('PRIVATE KEY');
  });
});

describe('L1: files with more than one hard link are refused', () => {
  it('a hardlink to a denied file under an innocent name is refused for read and search', async () => {
    const dir = path.join(base, 'l1');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '.env'), 'HARDLINKED_SECRET=1\n');
    fs.linkSync(path.join(dir, '.env'), path.join(dir, 'innocent.txt'));
    expect(await code(readFileTool(dir, { path: 'innocent.txt' }))).toBe('file has more than one hard link; refused');
    const r = await searchFilesTool(dir, { pattern: 'HARDLINKED' });
    expect(r.matches).toEqual([]);
  });
  it('a normal single-link file is unaffected', async () => {
    const dir = path.join(base, 'l1ok');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'fine');
    expect((await readFileTool(dir, { path: 'a.txt' })).content).toBe('fine');
  });
});

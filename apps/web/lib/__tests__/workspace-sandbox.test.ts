import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDeniedRelPath, isInside, resolveRoot, resolveWorkspacePath, resolveGitPathspec, SandboxError } from '../workspace-tools/sandbox';
import { listFilesTool, readFileTool, searchFilesTool, readChecked, sameFile, LIMITS } from '../workspace-tools/fs-tools';
import { WORKSPACE_TOOL_DEFS, runWorkspaceTool, summariseWorkspaceInput } from '../workspace-tools';

let base: string;
let root: string;
let outside: string;
let evil: string;

beforeAll(async () => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ws-sbx-')));
  root = path.join(base, 'app');
  evil = path.join(base, 'app-evil');
  outside = path.join(base, 'outside');
  for (const d of [root, evil, outside, path.join(root, 'src'), path.join(root, 'node_modules/pkg'), path.join(root, '.next'), path.join(root, '.git'), path.join(root, '.ssh')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(root, 'src/a.ts'), 'const needle = 1;\nline two\nline three\n');
  fs.writeFileSync(path.join(root, '.env.example'), 'KEY=\n');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=hunter2hunter2\n');
  fs.writeFileSync(path.join(root, '.env.local'), 'needle=1\n');
  for (const n of ['k.pem', 'k.key', 'k.p12', 'k.pfx', 'id_rsa', 'id_rsa.', 'id_ed25519', '.npmrc', '.netrc', '.pgpass', 'credentials.json', 'secrets.yml']) fs.writeFileSync(path.join(root, n), 'needle secret');
  fs.writeFileSync(path.join(root, '.ssh/config'), 'needle');
  fs.writeFileSync(path.join(root, '.git/config'), 'needle');
  fs.writeFileSync(path.join(root, 'node_modules/pkg/i.js'), 'needle');
  fs.writeFileSync(path.join(root, '.next/b.js'), 'needle');
  fs.writeFileSync(path.join(evil, 'x.txt'), 'evil');
  fs.writeFileSync(path.join(outside, 'o.txt'), 'outside needle');
  fs.symlinkSync(outside, path.join(root, 'link-out'));
  fs.symlinkSync(path.join(outside, 'o.txt'), path.join(root, 'link-file'));
  fs.symlinkSync(path.join(root, '.env'), path.join(root, 'innocent.txt'));
  fs.symlinkSync(path.join(root, 'src/a.ts'), path.join(root, 'ok-link.ts'));
  fs.writeFileSync(path.join(root, 'bin.dat'), Buffer.from([1, 2, 0, 3]));
  fs.writeFileSync(path.join(root, 'big.txt'), 'x'.repeat(6 * 1024 * 1024));
  fs.writeFileSync(path.join(root, 'long.txt'), 'y'.repeat(200 * 1024));
  fs.writeFileSync(path.join(root, 'wide.txt'), 'needle ' + 'z'.repeat(1000) + '\n');
  fs.writeFileSync(path.join(root, 'key.txt'), 'token sk-ant-' + 'a'.repeat(30) + '\n');
});
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return e instanceof SandboxError ? e.code : 'other'; } };

describe('isInside', () => {
  it('is segment safe', () => {
    expect(isInside('/work/app', '/work/app')).toBe(true);
    expect(isInside('/work/app', '/work/app/src/x')).toBe(true);
    expect(isInside('/work/app', '/work/app-evil')).toBe(false);
    expect(isInside('/work/app', '/work/app-evil/x')).toBe(false);
    expect(isInside('/work/app', '/work')).toBe(false);
    expect(isInside('/work/app', '/work/app/../x')).toBe(false);
  });
});

describe('resolveRoot', () => {
  it('requires an absolute existing directory', async () => {
    expect(await resolveRoot(root)).toBe(root);
    expect(await code(resolveRoot('relative/dir'))).toBe('bad_root');
    expect(await code(resolveRoot(undefined))).toBe('bad_root');
    expect(await code(resolveRoot(path.join(base, 'missing')))).toBe('bad_root');
    expect(await code(resolveRoot(path.join(root, 'src/a.ts')))).toBe('bad_root');
  });
});

describe('resolveWorkspacePath', () => {
  it('resolves a normal relative path and an absolute path inside the root', async () => {
    expect((await resolveWorkspacePath(root, 'src/a.ts')).rel).toBe('src/a.ts');
    expect((await resolveWorkspacePath(root, path.join(root, 'src/a.ts'))).rel).toBe('src/a.ts');
    expect((await resolveWorkspacePath(root, '.')).rel).toBe('.');
  });
  it('refuses traversal, outside absolutes, sibling-prefix dirs, null bytes, backslashes', async () => {
    expect(await code(resolveWorkspacePath(root, '../outside/o.txt'))).toBe('outside_root');
    expect(await code(resolveWorkspacePath(root, 'src/../../outside/o.txt'))).toBe('outside_root');
    expect(await code(resolveWorkspacePath(root, path.join(outside, 'o.txt')))).toBe('outside_root');
    expect(await code(resolveWorkspacePath(root, '/etc/passwd'))).toBe('outside_root');
    expect(await code(resolveWorkspacePath(root, '../app-evil/x.txt'))).toBe('outside_root');
    expect(await code(resolveWorkspacePath(root, path.join(evil, 'x.txt')))).toBe('outside_root');
    expect(await code(resolveWorkspacePath(root, 'src/a.ts\0.txt'))).toBe('invalid_path');
    expect(await code(resolveWorkspacePath(root, 'src\\a.ts'))).toBe('invalid_path');
    expect(await code(resolveWorkspacePath(root, ''))).toBe('invalid_path');
    expect(await code(resolveWorkspacePath(root, 42))).toBe('invalid_path');
    expect(await code(resolveWorkspacePath(root, 'a'.repeat(2000)))).toBe('invalid_path');
  });
  it('refuses symlinks that leave the root, and symlinks to denied files', async () => {
    expect(await code(resolveWorkspacePath(root, 'link-out'))).toBe('outside_root');
    expect(await code(resolveWorkspacePath(root, 'link-out/o.txt'))).toBe('outside_root');
    expect(await code(resolveWorkspacePath(root, 'link-file'))).toBe('outside_root');
    expect(await code(resolveWorkspacePath(root, 'innocent.txt'))).toBe('denied');
    expect((await resolveWorkspacePath(root, 'ok-link.ts')).rel).toBe('src/a.ts');
  });
  it('reports a missing path', async () => {
    expect(await code(resolveWorkspacePath(root, 'nope.txt'))).toBe('not_found');
  });
});

describe('deny list', () => {
  const denied = ['.env', '.env.local', '.env.production', 'k.pem', 'k.key', 'k.p12', 'k.pfx', 'id_rsa', 'id_rsa.', 'id_ed25519', '.ssh/config', '.aws/credentials', '.npmrc', '.netrc', '.pgpass', 'credentials.json', 'secrets.yml', '.git/config', 'node_modules/pkg/i.js', '.next/b.js', 'src/.ENV', 'a/b/K.PEM'];
  it.each(denied)('refuses %s in the pure check', (p) => expect(isDeniedRelPath(p)).toBe(true));
  it('allows .env.example and ordinary files', () => {
    expect(isDeniedRelPath('.env.example')).toBe(false);
    expect(isDeniedRelPath('src/a.ts')).toBe(false);
    expect(isDeniedRelPath('environment.ts')).toBe(false);
  });
  it.each(['.env', '.env.local', 'k.pem', 'k.key', 'k.p12', 'k.pfx', 'id_rsa', 'id_ed25519', '.ssh/config', '.npmrc', '.netrc', '.pgpass', 'credentials.json', 'secrets.yml', '.git/config', 'node_modules/pkg/i.js', '.next/b.js'])('read_file refuses existing %s', async (p) => {
    expect(await code(readFileTool(root, { path: p }))).toBe('denied');
  });
  it('reads .env.example', async () => {
    expect((await readFileTool(root, { path: '.env.example' })).content).toBe('KEY=');
  });
});

describe('read_file', () => {
  it('returns lines with metadata and honours start/count', async () => {
    const r = await readFileTool(root, { path: 'src/a.ts', start_line: 2, line_count: 1 });
    expect(r).toMatchObject({ content: 'line two', start_line: 2, end_line: 2, total_lines: 3, truncated: true });
  });
  it('refuses binary files and files over 5 MB', async () => {
    expect(await code(readFileTool(root, { path: 'bin.dat' }))).toBe('invalid_path');
    expect(await code(readFileTool(root, { path: 'big.txt' }))).toBe('invalid_path');
  });
  it('truncates to 64 KB with a flag', async () => {
    const r = await readFileTool(root, { path: 'long.txt' });
    expect(Buffer.byteLength(r.content)).toBeLessThanOrEqual(64 * 1024);
    expect(r.truncated).toBe(true);
  });
  it('redacts secret-shaped strings', async () => {
    const r = await readFileTool(root, { path: 'key.txt' });
    expect(r.content).not.toContain('sk-ant-');
    expect(r.content).toContain('[redacted:anthropic_api_key]');
  });
  it('refuses a directory', async () => {
    expect(await code(readFileTool(root, { path: 'src' }))).toBe('not_a_file');
  });
});

describe('list_files', () => {
  it('lists relative paths and types, skipping denied entries and outside symlinks', async () => {
    const r = await listFilesTool(root, { depth: 1 });
    const names = r.entries.map((e) => e.path);
    expect(names).toContain('src');
    expect(names).toContain('.env.example');
    expect(names).toContain('ok-link.ts');
    for (const bad of ['.env', '.env.local', 'node_modules', '.next', '.git', '.ssh', 'k.pem', 'id_rsa', 'link-out', 'link-file', 'innocent.txt', 'secrets.yml', 'credentials.json']) expect(names).not.toContain(bad);
    expect(r.entries.find((e) => e.path === 'src')?.type).toBe('dir');
    expect(JSON.stringify(r)).not.toContain(base);
  });
  it('recurses to the depth cap and no further', async () => {
    fs.mkdirSync(path.join(root, 'd1/d2/d3/d4/d5'), { recursive: true });
    fs.writeFileSync(path.join(root, 'd1/d2/d3/d4/d5/deep.txt'), 'x');
    const r = await listFilesTool(root, { path: 'd1', depth: 99 });
    const names = r.entries.map((e) => e.path);
    expect(names).toContain('d1/d2/d3/d4/d5');
    expect(names).not.toContain('d1/d2/d3/d4/d5/deep.txt');
  });
  it('caps at 500 entries', async () => {
    fs.mkdirSync(path.join(root, 'many'));
    for (let i = 0; i < 520; i++) fs.writeFileSync(path.join(root, 'many', `f${i}.txt`), '');
    const r = await listFilesTool(root, { path: 'many' });
    expect(r.entries).toHaveLength(500);
    expect(r.truncated).toBe(true);
  });
  it('refuses a file and an outside directory', async () => {
    expect(await code(listFilesTool(root, { path: 'src/a.ts' }))).toBe('not_a_directory');
    expect(await code(listFilesTool(root, { path: '..' }))).toBe('outside_root');
    expect(await code(listFilesTool(root, { path: 'node_modules' }))).toBe('denied');
  });
});

describe('search_files', () => {
  it('finds literal matches and never reads denied or outside files', async () => {
    const r = await searchFilesTool(root, { pattern: 'needle' });
    const files = new Set(r.matches.map((m) => m.path));
    expect(files.has('src/a.ts')).toBe(true);
    for (const bad of ['.env', '.env.local', 'k.pem', 'secrets.yml', 'node_modules/pkg/i.js', '.next/b.js', '.git/config', '.ssh/config', 'link-file', 'link-out/o.txt', 'innocent.txt', 'credentials.json']) expect(files.has(bad)).toBe(false);
    expect(r.matches[0]).toMatchObject({ path: expect.any(String), line: expect.any(Number), text: expect.any(String) });
  });
  it('treats metacharacters literally by default', async () => {
    expect((await searchFilesTool(root, { pattern: '.*' })).matches).toHaveLength(0);
  });
  it('truncates match lines to 300 chars', async () => {
    const r = await searchFilesTool(root, { pattern: 'needle zzz', path: 'wide.txt' });
    expect(r.matches[0].text.length).toBeLessThanOrEqual(LIMITS.searchMatchLineChars);
  });
  it('has no regex mode: the ReDoS pattern is searched literally and returns quickly', async () => {
    const evilPattern = 'a*a*a*a*a*a*a*a*a*a*a*b';
    fs.writeFileSync(path.join(root, 'redos.txt'), 'a'.repeat(999) + '\n' + 'literal ' + evilPattern + '\n');
    // No RegExp may be built from the model's pattern: it is matched as a literal substring.
    const real = globalThis.RegExp;
    const built: string[] = [];
    const Spy = new Proxy(real, { construct(t, args) { built.push(String(args[0])); return Reflect.construct(t, args); } });
    vi.stubGlobal('RegExp', Spy);
    let r;
    try { r = await searchFilesTool(root, { pattern: evilPattern, path: 'redos.txt' }); } finally { vi.unstubAllGlobals(); }
    expect(built.filter((src) => src.includes('a*a*a*'))).toEqual([]);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].line).toBe(2);
    expect(r.matches[0].text).toContain(evilPattern);
    // The strict schema rejects a regex argument, through the real entry point.
    const props = (WORKSPACE_TOOL_DEFS.find((d) => d.name === 'search_files')!.inputSchema as any).properties;
    expect(props.regex).toBeUndefined();
  });
  it('rejects regex:true at the schema', async () => {
    vi.stubEnv('WHINK_LOCAL_AGENT_TOOLS', 'true');
    vi.stubEnv('WHINK_WORKSPACE_ROOT', root);
    const r = await runWorkspaceTool('search_files', { pattern: 'a*a*a*b', regex: true });
    vi.unstubAllEnvs();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/invalid arguments/);
  });
  it('caps pattern length and matches', async () => {
    expect(await code(searchFilesTool(root, { pattern: 'a'.repeat(201) }))).toBe('invalid_path');
    expect(await code(searchFilesTool(root, { pattern: '' }))).toBe('invalid_path');
    fs.mkdirSync(path.join(root, 'hits'));
    fs.writeFileSync(path.join(root, 'hits/h.txt'), 'hit\n'.repeat(300));
    const r = await searchFilesTool(root, { pattern: 'hit', path: 'hits' });
    expect(r.matches).toHaveLength(100);
    expect(r.truncated).toBe(true);
  });
  it('caps files scanned', async () => {
    fs.mkdirSync(path.join(root, 'scan'));
    for (let i = 0; i < 2100; i++) fs.writeFileSync(path.join(root, 'scan', `s${i}.txt`), 'x');
    const r = await searchFilesTool(root, { pattern: 'nomatch', path: 'scan' });
    expect(r.files_scanned).toBeLessThanOrEqual(LIMITS.searchMaxFilesScanned);
    expect(r.truncated).toBe(true);
  });
  it('skips binary files and refuses an outside or denied start path', async () => {
    expect((await searchFilesTool(root, { pattern: '\u0001', path: 'bin.dat' })).matches).toHaveLength(0);
    expect(await code(searchFilesTool(root, { pattern: 'x', path: '../outside' }))).toBe('outside_root');
    expect(await code(searchFilesTool(root, { pattern: 'x', path: '.env' }))).toBe('denied');
  });
});

describe('resolveGitPathspec', () => {
  it('accepts existing and deleted paths, refuses denied, outside, magic and option-like', async () => {
    expect(await resolveGitPathspec(root, 'src/a.ts')).toBe('src/a.ts');
    expect(await resolveGitPathspec(root, 'src/gone.ts')).toBe('src/gone.ts');
    expect(await code(resolveGitPathspec(root, '.env'))).toBe('denied');
    expect(await code(resolveGitPathspec(root, '../outside'))).toBe('outside_root');
    expect(await code(resolveGitPathspec(root, 'link-out/new.txt'))).toBe('outside_root');
    expect(await code(resolveGitPathspec(root, ':(top)x'))).toBe('invalid_path');
    expect(await code(resolveGitPathspec(root, '--output=x'))).toBe('invalid_path');
    expect(await code(resolveGitPathspec(root, '-p'))).toBe('invalid_path');
  });
});

describe('extended deny list (reviewer examples)', () => {
  const must = ['prod.env', 'staging.ENV', '.envrc', 'id_ecdsa', 'id_dsa', 'id_ed25519.bak', '.git-credentials', 'a.jks', 'a.keystore', '.pypirc',
    '.docker/config.json', '.kube/config', '.gnupg/pubring.kbx', '.terraform/x', 'main.tfstate', 'main.tfstate.backup', '.dev.vars',
    'service-account-prod.json', 'my-credentials.json', 'gcp_credentials_v2.json', '.claude/settings.local.json', 'x/.CLAUDE/Settings.Local.json',
    'prod.env.', 'prod.env ', 'id_rsa.', '.ENVRC', '.Env.Local',
    'e\u0301/.env', '.en\u200Bv', 'id_\u0072sa'];
  it.each(must)('denies %j', (p) => expect(isDeniedRelPath(p)).toBe(true));
  it('still allows ordinary files, public keys and .env.example', () => {
    for (const p of ['id_rsa.pub', 'id_ed25519.pub', '.env.example', '.secret-scan-allow', '.claude/settings.json', 'README.md', 'src/environment.ts', 'monkey.ts', 'id_utils.ts', 'credentials.ts', 'src/credentials.tsx', 'id_rsa.pub']) {
      expect(isDeniedRelPath(p), p).toBe(false);
    }
  });
  it('NFD and NFC spellings of a denied name are both denied', () => {
    const nfc = 'cr\u00E9dentials.json'.normalize('NFC');
    expect(isDeniedRelPath('secrets.yml'.normalize('NFD'))).toBe(true);
    expect(isDeniedRelPath(nfc)).toBe(false); // not credentials*: accented e is a different word
    expect(isDeniedRelPath('credentials.json'.normalize('NFD'))).toBe(true);
  });
  it('reads of these files through the tool are refused when they exist', async () => {
    for (const n of ['prod.env', '.envrc', 'id_ecdsa', '.git-credentials']) fs.writeFileSync(path.join(root, n), 'TOPSECRET');
    for (const n of ['prod.env', '.envrc', 'id_ecdsa', '.git-credentials']) expect(await code(readFileTool(root, { path: n }))).toBe('denied');
    const names = (await listFilesTool(root, {})).entries.map((e) => e.path);
    for (const n of ['prod.env', '.envrc', 'id_ecdsa', '.git-credentials']) expect(names).not.toContain(n);
    const hits = (await searchFilesTool(root, { pattern: 'TOPSECRET' })).matches;
    expect(hits).toHaveLength(0);
  });
});

describe('git-ignored files are invisible in a work tree, deny list only otherwise', () => {
  let repo: string;
  beforeAll(() => {
    repo = path.join(base, 'ignrepo');
    fs.mkdirSync(path.join(repo, 'build'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'src'));
    const g = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'pipe', env: { PATH: process.env.PATH!, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } as unknown as NodeJS.ProcessEnv });
    g('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(repo, '.gitignore'), 'build/\n*.log\nlocal-notes.txt\n');
    fs.writeFileSync(path.join(repo, 'src/app.ts'), 'KEEPME visible\n');
    fs.writeFileSync(path.join(repo, 'untracked.ts'), 'KEEPME untracked but not ignored\n');
    fs.writeFileSync(path.join(repo, 'build/out.js'), 'KEEPME built\n');
    fs.writeFileSync(path.join(repo, 'debug.log'), 'KEEPME log\n');
    fs.writeFileSync(path.join(repo, 'local-notes.txt'), 'KEEPME notes\n');
    g('add', '.gitignore', 'src');
  });
  it('list_files and search_files never show ignored files; untracked non-ignored ones appear', async () => {
    const names = (await listFilesTool(repo, { depth: 4 })).entries.map((e) => e.path);
    expect(names).toEqual(expect.arrayContaining(['src', 'src/app.ts', 'untracked.ts', '.gitignore']));
    for (const bad of ['build', 'build/out.js', 'debug.log', 'local-notes.txt']) expect(names).not.toContain(bad);
    const files = (await searchFilesTool(repo, { pattern: 'KEEPME' })).matches.map((m) => m.path).sort();
    expect(files).toEqual(['src/app.ts', 'untracked.ts']);
  });
  it('read_file refuses ignored files and an ignored directory, allows the rest', async () => {
    expect(await code(readFileTool(repo, { path: 'debug.log' }))).toBe('denied');
    expect(await code(readFileTool(repo, { path: 'build/out.js' }))).toBe('denied');
    expect(await code(listFilesTool(repo, { path: 'build' }))).toBe('denied');
    expect((await readFileTool(repo, { path: 'src/app.ts' })).content).toContain('KEEPME');
    expect((await readFileTool(repo, { path: 'untracked.ts' })).content).toContain('KEEPME');
  });
  it('outside a git repository only the deny list applies', async () => {
    expect((await readFileTool(root, { path: 'src/a.ts' })).content).toContain('needle');
  });
});

describe('TOCTOU re-check', () => {
  it('sameFile compares dev and ino', () => {
    expect(sameFile({ dev: 1, ino: 2 }, { dev: 1, ino: 2 })).toBe(true);
    expect(sameFile({ dev: 1, ino: 2 }, { dev: 1, ino: 3 })).toBe(false);
    expect(sameFile({ dev: 2, ino: 2 }, { dev: 1, ino: 2 })).toBe(false);
  });
  it('O_NOFOLLOW refuses a path that became a symlink', async () => {
    const f = path.join(root, 'swap1.txt');
    fs.writeFileSync(f, 'x');
    fs.rmSync(f);
    fs.symlinkSync(path.join(outside, 'o.txt'), f);
    await expect(readChecked(root, f, 1000)).rejects.toBeInstanceOf(SandboxError);
  });
  it('refuses when the path is swapped to a different file between the read and the re-check', async () => {
    const f = path.join(root, 'swap2.txt');
    fs.writeFileSync(f, 'original');
    await expect(readChecked(root, f, 1000, () => {
      fs.writeFileSync(path.join(root, 'swap2.new'), 'replacement');
      fs.renameSync(path.join(root, 'swap2.new'), f);
    })).rejects.toMatchObject({ code: 'denied' });
  });
  it('refuses when a parent directory is swapped for a symlink out of the root', async () => {
    fs.mkdirSync(path.join(root, 'pd'));
    const f = path.join(root, 'pd/file.txt');
    fs.writeFileSync(f, 'inside');
    fs.writeFileSync(path.join(outside, 'file.txt'), 'outside');
    await expect(readChecked(root, f, 1000, () => {
      fs.renameSync(path.join(root, 'pd'), path.join(root, 'pd-old'));
      fs.symlinkSync(outside, path.join(root, 'pd'));
    })).rejects.toBeInstanceOf(SandboxError);
  });
  it('passes when nothing changes', async () => {
    const f = path.join(root, 'stable.txt');
    fs.writeFileSync(f, 'same');
    expect((await readChecked(root, f, 1000)).buf.toString()).toBe('same');
  });
});

describe('ledger input summary', () => {
  it('records pattern length and a short hash, never the pattern', () => {
    const sum = summariseWorkspaceInput('search_files', { pattern: 'sk-super-secret-value', path: 'src' });
    expect(sum).not.toContain('sk-super');
    expect(sum).toMatch(/pattern_len=21 pattern_sha=[0-9a-f]{8}/);
    expect(sum).toContain('path=src');
  });
});

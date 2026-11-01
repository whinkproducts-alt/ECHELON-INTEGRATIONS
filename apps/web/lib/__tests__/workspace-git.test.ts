import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitDiffTool, gitLogTool, gitStatusTool, filterPatch, filterStatLines, filterStatusLines } from '../workspace-tools/git';
import { SandboxError } from '../workspace-tools/sandbox';

let base: string;
let repo: string;
const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, env: { PATH: process.env.PATH!, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } as unknown as NodeJS.ProcessEnv, stdio: 'pipe' }).toString();

beforeAll(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ws-git-')));
  repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  git('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  fs.writeFileSync(path.join(repo, '.env'), 'SECRET=1\n');
  git('add', '-f', '.');
  git('commit', '-q', '-m', 'first commit');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\n');
  fs.writeFileSync(path.join(repo, '.env'), 'SECRET=2\n');
  fs.writeFileSync(path.join(repo, 'new.txt'), 'new\n');
});
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

describe('git tools', () => {
  it('git_status shows branch and changes, hiding denied paths', async () => {
    const r = await gitStatusTool(repo);
    expect(r.ok).toBe(true);
    expect(r.output).toContain('## main');
    expect(r.output).toContain('a.txt');
    expect(r.output).toContain('new.txt');
    expect(r.output).not.toContain('.env');
  });
  it('git_diff stat and patch; denied files removed from both', async () => {
    const stat = await gitDiffTool(repo, {});
    expect(stat.output).toContain('a.txt');
    expect(stat.output).not.toContain('.env');
    const patch = await gitDiffTool(repo, { patch: true });
    expect(patch.output).toContain('+two');
    expect(patch.output).not.toContain('SECRET');
    expect(patch.output).not.toContain('.env');
  });
  it('git_diff with a path limits output; denied path is refused', async () => {
    const r = await gitDiffTool(repo, { path: 'a.txt', patch: true });
    expect(r.output).toContain('a.txt');
    await expect(gitDiffTool(repo, { path: '.env' })).rejects.toBeInstanceOf(SandboxError);
  });
  it('argument injection through path is refused', async () => {
    for (const p of ['--output=x', '-p', '--ext-diff', ':(top)a.txt', '../x']) {
      await expect(gitDiffTool(repo, { path: p })).rejects.toBeInstanceOf(SandboxError);
    }
    expect(fs.existsSync(path.join(repo, 'x'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'x'))).toBe(false);
  });
  it('git_log returns N commits and enforces 1..30', async () => {
    const r = await gitLogTool(repo, { n: 5 });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('first commit');
    for (const n of [0, 31, -1, 1.5, NaN]) expect((await gitLogTool(repo, { n })).ok).toBe(false);
    expect((await gitLogTool(repo, {})).ok).toBe(true);
  });
  it('reports a clean error outside a repository', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-nogit-'));
    try {
      const r = await gitStatusTool(plain);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/not a git repository|inside a git repository/i);
      expect(r.error).not.toContain(plain);
    } finally { fs.rmSync(plain, { recursive: true, force: true }); }
  });
  it('filters are pure helpers', () => {
    expect(filterStatusLines('## main\n M a\n?? .env\n')).toBe('## main\n M a\n');
    expect(filterStatLines(' a | 1 +\n .env | 1 +\n 2 files changed')).toBe(' a | 1 +\n 2 files changed');
    expect(filterPatch('diff --git a/a b/a\n+x\ndiff --git a/.env b/.env\n+SECRET\n')).toBe('diff --git a/a b/a\n+x\n');
  });
});

describe('hostile repo config is not executed', () => {
  it('core.pager, core.fsmonitor, diff.external, textconv, showSignature create no marker', async () => {
    const marker = path.join(base, 'MARKER');
    const script = path.join(base, 'evil.sh');
    fs.writeFileSync(script, `#!/bin/sh\ntouch ${marker}\ncat\n`, { mode: 0o755 });
    git('config', 'core.pager', script);
    git('config', 'core.fsmonitor', script);
    git('config', 'diff.external', script);
    git('config', 'diff.evil.textconv', script);
    git('config', 'log.showSignature', 'true');
    git('config', 'gpg.program', script);
    git('config', 'core.hooksPath', path.join(base, 'hooks'));
    fs.writeFileSync(path.join(repo, '.gitattributes'), '*.txt diff=evil\n');
    await gitStatusTool(repo);
    await gitDiffTool(repo, {});
    await gitDiffTool(repo, { patch: true });
    await gitDiffTool(repo, { path: 'a.txt', patch: true });
    await gitLogTool(repo, { n: 3 });
    expect(fs.existsSync(marker)).toBe(false);
  });
});

function freshRepo(name: string): { dir: string; run: (...a: string[]) => string } {
  const dir = path.join(base, name);
  fs.mkdirSync(dir);
  const run = (...a: string[]) => execFileSync('git', a, { cwd: dir, env: { PATH: process.env.PATH!, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } as unknown as NodeJS.ProcessEnv, stdio: 'pipe' }).toString();
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 'T');
  run('config', 'commit.gpgsign', 'false');
  return { dir, run };
}

describe('secret redaction in git output', () => {
  it('redacts a key in a diff and a token in a commit message', async () => {
    const { dir, run } = freshRepo('redact');
    fs.writeFileSync(path.join(dir, 'conf.txt'), 'a\n');
    run('add', '.');
    run('commit', '-q', '-m', 'init with ghp_' + 'A'.repeat(36));
    fs.writeFileSync(path.join(dir, 'conf.txt'), 'a\nkey=sk-ant-' + 'b'.repeat(30) + '\n');
    const d = await gitDiffTool(dir, { patch: true });
    expect(d.ok).toBe(true);
    expect(d.output).not.toContain('sk-ant-bbbb');
    expect(d.output).toContain('[redacted:anthropic_api_key]');
    const l = await gitLogTool(dir, { n: 3 });
    expect(l.output).not.toContain('ghp_AAAA');
    expect(l.output).toContain('[redacted:github_token]');
  });
});

describe('hostile repository configuration is refused, never executed', () => {
  function hostile(name: string, where: 'gitattributes' | 'info') {
    const { dir, run } = freshRepo(name);
    const marker = path.join(base, `MARK-${name}`);
    const script = path.join(base, `${name}.sh`);
    fs.writeFileSync(script, `#!/bin/sh\ntouch ${marker}\ncat\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
    run('add', '.');
    run('commit', '-q', '-m', 'c');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'two\n');
    if (where === 'gitattributes') fs.writeFileSync(path.join(dir, '.gitattributes'), '*.txt filter=evil\n');
    else fs.writeFileSync(path.join(dir, '.git/info/attributes'), '*.txt filter=evil\n');
    return { dir, run, marker, script };
  }
  it.each(['gitattributes', 'info'] as const)('filter.evil.clean via %s: marker not created, tools refuse', async (where) => {
    const h = hostile(`evil-${where}`, where);
    h.run('config', 'filter.evil.clean', h.script);
    h.run('config', 'filter.evil.smudge', h.script);
    for (const r of [await gitStatusTool(h.dir), await gitDiffTool(h.dir, {}), await gitDiffTool(h.dir, { patch: true }), await gitLogTool(h.dir, { n: 2 })]) {
      expect(r.ok).toBe(false);
      expect(r.error).toBe('repository configuration not allowed');
    }
    expect(fs.existsSync(h.marker)).toBe(false);
  });
  it.each(['gitattributes', 'info'] as const)('attributes alone (%s) without a filter config: marker not created', async (where) => {
    // Even if the filter config were somehow missed, attributes come from the empty tree and /dev/null.
    const h = hostile(`attr-${where}`, where);
    if (where === 'info') {
      // A non-empty info/attributes is itself refused.
      const r = await gitStatusTool(h.dir);
      expect(r.ok).toBe(false);
      expect(r.error).toBe('repository configuration not allowed');
    } else {
      const r = await gitStatusTool(h.dir);
      expect(r.ok).toBe(true);
    }
    expect(fs.existsSync(h.marker)).toBe(false);
  });
  it('include.path and includeIf are refused', async () => {
    const { dir, run } = freshRepo('inc');
    fs.writeFileSync(path.join(base, 'extra.cfg'), '[core]\n\tpager = cat\n');
    run('config', 'include.path', path.join(base, 'extra.cfg'));
    expect((await gitStatusTool(dir)).error).toBe('repository configuration not allowed');
    const b = freshRepo('inc2');
    b.run('config', 'includeIf.gitdir:/x/.path', path.join(base, 'extra.cfg'));
    expect((await gitLogTool(b.dir, { n: 1 })).error).toBe('repository configuration not allowed');
  });
  it('an empty info/attributes file is fine', async () => {
    const { dir } = freshRepo('emptyattr');
    fs.mkdirSync(path.join(dir, '.git/info'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git/info/attributes'), '');
    expect((await gitStatusTool(dir)).ok).toBe(true);
  });
});

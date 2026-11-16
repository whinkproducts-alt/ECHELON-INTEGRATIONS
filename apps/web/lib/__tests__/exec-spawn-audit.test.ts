/** Item 68 audit: nothing may start a process except lib/exec-runner.ts (and the reviewed read-only git tool). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const ALLOWED: Record<string, string> = {
  'lib/exec-runner.ts': 'the sole runner, called only after classify and gate',
  'lib/workspace-tools/git.ts': 'fixed read-only git argument lists, repo config refused (reviewed)',
  'lib/skills/scanner.ts': 'mentions child_process in a detection regex only',
};
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (['node_modules', '__tests__', '.next'].includes(n)) continue;
    const f = path.join(dir, n);
    if (statSync(f).isDirectory()) walk(f, out); else if (/\.[cm]?[jt]sx?$/.test(n)) out.push(f);
  }
  return out;
}
const SPAWN = /child_process|\b(?:execa|cross-spawn|shelljs|node-pty)\b|Bun\.spawn|Deno\.Command|\bposix_spawn\b/;
describe('only the reviewed runner starts processes', () => {
  const hits = ['lib', 'app', 'components'].flatMap((d) => { try { return walk(path.join(ROOT, d)); } catch { return []; } })
    .map((f) => path.relative(ROOT, f)).filter((rel) => SPAWN.test(readFileSync(path.join(ROOT, rel), 'utf8')));
  it('has no unreviewed spawner', () => expect(hits.filter((h) => !ALLOWED[h])).toEqual([]));
  it('has no stale entries', () => expect(Object.keys(ALLOWED).filter((k) => !hits.includes(k))).toEqual([]));
  it('exec-runner is imported only by the reviewed callers', () => {
    const callers = walk(path.join(ROOT, 'lib')).map((f) => path.relative(ROOT, f)).filter((r) => /exec-runner'/.test(readFileSync(path.join(ROOT, r), 'utf8')));
    expect(callers.sort()).toEqual(['lib/exec-backend.ts', 'lib/remote/ssh.ts']);
  });
});

import { describe, it, expect } from 'vitest';
import { scanText, shouldScanPath, isForbiddenEnvFile, SECRET_RULES } from '../secret-scan';

// Fixtures are assembled at runtime so this file does not itself contain a key-shaped string.
const rep = (c: string, n: number) => c.repeat(n);
const fixtures: Record<string, string> = {
  anthropic_api_key: 'sk-ant-' + rep('a', 30),
  openai_api_key: 'sk-' + rep('B', 40),
  aws_access_key_id: 'AKIA' + rep('A', 16),
  github_token: 'ghp_' + rep('a', 36),
  google_api_key: 'AIza' + rep('x', 35),
  slack_token: 'xoxb-' + rep('1', 12),
  stripe_live_key: 'sk_live_' + rep('a', 20),
  twilio_auth_token_assignment: 'TWILIO_AUTH_TOKEN=' + rep('a', 32),
  telegram_bot_token: '12345678:' + rep('A', 35),
  private_key_block: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
  jwt: 'eyJ' + rep('a', 12) + '.eyJ' + rep('b', 12) + '.' + rep('c', 12),
  database_url_with_password: 'postgres://user:hunter22@db.example.com/app',
  secret_assignment: 'const apiKey = "' + rep('z', 24) + '"',
};

describe('secret scanner', () => {
  it('has a fixture for every rule', () => {
    expect(Object.keys(fixtures).sort()).toEqual(SECRET_RULES.map((r) => r.name).sort());
  });
  for (const [rule, text] of Object.entries(fixtures)) {
    it(`detects ${rule}`, () => {
      const f = scanText('a.ts', `line one\nvalue ${text}\n`);
      expect(f.some((x) => x.rule === rule)).toBe(true);
      expect(f[0].line).toBe(2);
    });
  }
  it('never puts the full secret in a finding', () => {
    const secret = fixtures.anthropic_api_key;
    const [f] = scanText('a.ts', secret);
    expect(JSON.stringify(f)).not.toContain(secret);
    expect(f.preview).toContain('[redacted]');
  });
  it('ignores placeholders, env lookups, and marked lines', () => {
    expect(scanText('a.ts', 'const apiKey = process.env.ANTHROPIC_API_KEY')).toEqual([]);
    expect(scanText('a.ts', 'apiKey: "your_api_key_goes_here_please"')).toEqual([]);
    expect(scanText('a.ts', fixtures.jwt + ' // scan-secrets:ignore')).toEqual([]);
    expect(scanText('a.ts', 'ANTHROPIC_API_KEY=')).toEqual([]);
  });
  it('path rules', () => {
    expect(shouldScanPath('apps/web/lib/x.ts')).toBe(true);
    expect(shouldScanPath('node_modules/x/y.js')).toBe(false);
    expect(shouldScanPath('pnpm-lock.yaml')).toBe(false);
    expect(shouldScanPath('apps/web/public/board/a.webp')).toBe(false);
    expect(isForbiddenEnvFile('apps/web/.env')).toBe(true);
    expect(isForbiddenEnvFile('.env.local')).toBe(true);
    expect(isForbiddenEnvFile('apps/web/.env.example')).toBe(false);
  });
});

import { isExempt, parseIgnoreFile } from '../secret-scan';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('exemptions and staged-blob scanning', () => {
  it('own fixture files and listed paths are exempt; others are not', () => {
    expect(isExempt('apps/web/lib/secret-scan.ts')).toBe(true);
    expect(isExempt('apps/web/lib/__tests__/secret-scan.test.ts')).toBe(true);
    expect(isExempt('apps/web/lib/other.ts')).toBe(false);
    expect(isExempt('a/b.ts', ['a/b.ts'])).toBe(true);
    expect(parseIgnoreFile('# c\nfoo.ts # x\n\n bar.ts ')).toEqual(['foo.ts', 'bar.ts']);
  });
  it('scans the staged blob, not the working file (script run in a temp git repo)', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
    const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
    git('init', '-q');
    const secret = 'sk-ant-' + 'q'.repeat(30);
    fs.writeFileSync(path.join(repo, 'a.ts'), `const k = "${secret}";\n`);
    git('add', 'a.ts');
    fs.writeFileSync(path.join(repo, 'a.ts'), 'const k = "clean";\n'); // working file cleaned after staging
    const script = path.resolve(__dirname, '..', '..', 'scripts', 'scan-secrets.ts');
    const tsx = path.resolve(__dirname, '..', '..', 'node_modules', '.bin', 'tsx');
    let code = 0;
    try { execFileSync(tsx, [script], { cwd: repo, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { code = (e as { status: number }).status; }
    expect(code).toBe(1);
  });
});

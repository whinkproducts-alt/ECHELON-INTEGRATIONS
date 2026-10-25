/**
 * Pre-commit secret scan. No dependency.
 *
 *   pnpm security:scan              scan files staged in git (use as a pre-commit hook)
 *   pnpm security:scan -- --all     scan every tracked file
 *   pnpm security:scan -- --report scripts/secrets-scan.json   also write a counts-only report
 *
 * Exits 1 if anything is found or a .env file is staged. Output never contains a full secret.
 * Install as a hook: echo 'cd apps/web && pnpm security:scan' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isForbiddenEnvFile, scanText, shouldScanPath, type SecretFinding } from '../lib/secret-scan';

const args = process.argv.slice(2);
const all = args.includes('--all');
const reportIdx = args.indexOf('--report');
const reportPath = reportIdx >= 0 ? args[reportIdx + 1] : null;

const git = (a: string[]) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const root = git(['rev-parse', '--show-toplevel']).trim();
const files = (all ? git(['-C', root, 'ls-files', '-z']) : git(['-C', root, 'diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']))
  .split('\0').filter(Boolean);

const findings: SecretFinding[] = [];
const envFiles = files.filter(isForbiddenEnvFile);
for (const rel of files) {
  if (!shouldScanPath(rel)) continue;
  const full = path.join(root, rel);
  let text: string;
  try {
    const st = fs.statSync(full);
    if (!st.isFile() || st.size > 2 * 1024 * 1024) continue;
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) continue; // binary
    text = buf.toString('utf8');
  } catch { continue; }
  findings.push(...scanText(rel, text));
}

for (const f of envFiles) console.error(`BLOCKED: ${f} is an env file and must not be committed`);
for (const f of findings) console.error(`${f.file}:${f.line}  ${f.rule}  ${f.preview}`);

if (reportPath) {
  fs.writeFileSync(reportPath, JSON.stringify({ ranAt: new Date().toISOString(), scope: all ? 'all' : 'staged', filesScanned: files.length, findings: findings.length, envFiles: envFiles.length }, null, 2) + '\n');
}
if (findings.length || envFiles.length) {
  console.error(`\nsecurity:scan failed: ${findings.length} finding(s), ${envFiles.length} env file(s).`);
  process.exit(1);
}
console.log(`security:scan ok (${files.length} files, ${all ? 'all tracked' : 'staged'})`);

#!/usr/bin/env node
// Readiness check for a WHINK install. Reads facts, changes nothing, prints no secret values.
// Usage: node scripts/ops/readiness.mjs [--env path/to/runtime.env] [--url http://127.0.0.1:3211]
import { readFileSync, existsSync, statSync } from 'node:fs';
import net from 'node:net';
import { execFileSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const envPath = arg('--env', null);
const url = arg('--url', 'http://127.0.0.1:3211');

export function parseEnv(text) {
  const out = {};
  for (const l of text.split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m) out[m[1]] = m[2]; }
  return out;
}
const REQUIRED = ['DATABASE_URL', 'AUTH_SECRET', 'ENCRYPTION_KEY', 'WHINK_OWNER_EMAILS'];
/** Pure: returns [name, ok, detail][] for an env map. Secrets are only checked for presence and length. */
export function checkEnv(env) {
  const rows = REQUIRED.map((k) => [`env ${k}`, !!env[k], env[k] ? 'set' : 'missing']);
  if (env.ENCRYPTION_KEY) rows.push(['ENCRYPTION_KEY is 64 hex', /^[0-9a-f]{64}$/i.test(env.ENCRYPTION_KEY), 'format only']);
  if (env.AUTH_SECRET) rows.push(['AUTH_SECRET length >= 32', env.AUTH_SECRET.length >= 32, 'length only']);
  return rows;
}
const tcp = (host, port) => new Promise((r) => { const s = net.connect({ host, port, timeout: 2000 }, () => { s.destroy(); r(true); }); s.on('error', () => r(false)); s.on('timeout', () => { s.destroy(); r(false); }); });

async function main() {
  const rows = [];
  rows.push(['node >= 20', Number(process.versions.node.split('.')[0]) >= 20, process.version]);
  try { execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 8000 }); rows.push(['docker running', true, '']); } catch { rows.push(['docker running', false, 'docker info failed']); }
  if (envPath) {
    if (!existsSync(envPath)) rows.push(['runtime env file', false, 'not found']);
    else {
      rows.push(['runtime env mode 0600', process.platform === 'win32' || (statSync(envPath).mode & 0o077) === 0, 'file permissions']);
      rows.push(...checkEnv(parseEnv(readFileSync(envPath, 'utf8'))));
    }
  }
  try { const r = await fetch(`${url}/login`, { signal: AbortSignal.timeout(4000) }); rows.push([`web ${url}/login`, r.ok, `HTTP ${r.status}`]); } catch (e) { rows.push([`web ${url}/login`, false, String(e.message || e)]); }
  rows.push(['ollama 127.0.0.1:11434', await tcp('127.0.0.1', 11434), 'optional: local models']);
  for (const [n, ok, d] of rows) console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' - ' + d : ''}`);
  process.exit(rows.some(([n, ok]) => !ok && !n.startsWith('ollama')) ? 1 : 0);
}
if (import.meta.url === `file://${process.argv[1]}`) main();

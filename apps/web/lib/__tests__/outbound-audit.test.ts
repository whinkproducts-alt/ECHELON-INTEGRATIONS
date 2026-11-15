/**
 * Item 57 call-site audit. Every server file that calls fetch( must be listed here with why it is safe in Local-Only mode:
 * it checks the mode itself, it only reaches a configured local service, or it runs in the browser against this app.
 * A new file that calls fetch( fails this test until someone classifies it, so no outbound call is added unreviewed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const LOCAL_SERVICE = 'only the local service its env var names';
const BROWSER = 'browser code calling this app';
const NOTE: Record<string, string> = {
  'lib/capability/egress.ts': 'the egress allow-list itself: deny by default',
  'lib/anythingllm-client.ts': LOCAL_SERVICE, 'lib/model-router/hermes-client.ts': LOCAL_SERVICE,
  'lib/speech-services.ts': LOCAL_SERVICE, 'lib/speech-transport.ts': LOCAL_SERVICE, 'lib/offline.ts': 'checks this app is reachable',
  'lib/dashboard-client.ts': BROWSER, 'lib/hooks/approval-state.ts': BROWSER,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '__tests__' || n === '.next') continue;
    const f = path.join(dir, n);
    if (statSync(f).isDirectory()) walk(f, out); else if (/\.tsx?$/.test(n)) out.push(f);
  }
  return out;
}

describe('every file that calls fetch( is reviewed for Local-Only mode', () => {
  const files = [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'app'))]
    .map((f) => ({ rel: path.relative(ROOT, f), src: readFileSync(f, 'utf8') }))
    .filter((f) => /\bfetch\(/.test(f.src) && !/^\s*(['"])use client\1/m.test(f.src.slice(0, 400))); // 'use client' files run in the browser against this app

  it('checks the mode itself or is classified', () => {
    const unreviewed = files.filter((f) => !/isLocalOnly|LOCAL_ONLY|localOnlyBlocksUrl/.test(f.src) && !NOTE[f.rel]).map((f) => f.rel);
    expect(unreviewed, 'classify these in NOTE or add a Local-Only check').toEqual([]);
  });
  it('has no stale entries in the classification', () => {
    const present = new Set(files.map((f) => f.rel));
    expect(Object.keys(NOTE).filter((k) => !present.has(k))).toEqual([]);
  });
});

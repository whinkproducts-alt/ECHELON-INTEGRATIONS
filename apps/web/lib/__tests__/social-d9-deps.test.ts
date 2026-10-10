/**
 * D9: official APIs only. Walk pnpm-lock.yaml from the apps/web importer (direct dependencies and
 * devDependencies) through every non-optional transitive edge in `snapshots`, and fail if any
 * scraping or browser automation package is reachable. Optional edges and peerDependenciesMeta
 * entries are not install requirements, so they are excluded (as the criterion says "non-optional").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const LOCK = join(__dirname, '../../../../pnpm-lock.yaml');

const BANNED = [
  'puppeteer', 'puppeteer-core', 'puppeteer-extra', 'playwright', 'playwright-core', 'playwright-chromium', 'playwright-firefox', 'playwright-webkit',
  'selenium-webdriver', 'webdriverio', 'chromedriver', 'geckodriver', 'nightmare', 'zombie', 'crawlee', 'apify', 'x-ray', 'osmosis',
  'cheerio', 'chrome-aws-lambda', 'cypress', 'testcafe', 'rebrowser-puppeteer', 'rebrowser-playwright',
];
const bannedMatch = (name: string) =>
  BANNED.includes(name) || /^@(playwright|puppeteer|wdio|sparticuz|crawlee|apify)\//.test(name) || /^puppeteer-/.test(name) || /^playwright-/.test(name);

type Graph = { importerDeps: string[]; edges: Map<string, string[]> };

function nameOf(key: string): string {
  const i = key.indexOf('@', 1);
  return i === -1 ? key : key.slice(0, i);
}
function unquote(s: string) {
  return s.replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
}
/** Resolve a `name: version` pair to a snapshot key. Alias values already carry `name@version`. */
function toKey(name: string, version: string): string {
  const v = unquote(version.trim());
  if (/^@?[^@()\s]+@\d/.test(v)) return v; // alias: other-name@1.2.3(...)
  return `${name}@${v}`;
}

function parseLock(text: string): Graph {
  const lines = text.split('\n');
  const importerDeps: string[] = [];
  const edges = new Map<string, string[]>();

  // importers: apps/web -> dependencies + devDependencies (not optionalDependencies)
  const i = lines.findIndex((l) => l === 'importers:');
  const end = lines.findIndex((l, idx) => idx > i && /^\S/.test(l) && l !== 'importers:');
  let inWeb = false;
  let section = '';
  let pendingName = '';
  for (let n = i + 1; n < end; n++) {
    const l = lines[n];
    const imp = /^ {2}(\S.*):$/.exec(l);
    if (imp) { inWeb = unquote(imp[1]) === 'apps/web'; section = ''; continue; }
    if (!inWeb) continue;
    const sec = /^ {4}(\w+):$/.exec(l);
    if (sec) { section = sec[1]; continue; }
    const nm = /^ {6}(\S.*):$/.exec(l);
    if (nm) { pendingName = unquote(nm[1]); continue; }
    const ver = /^ {8}version: (.+)$/.exec(l);
    if (ver && (section === 'dependencies' || section === 'devDependencies')) importerDeps.push(toKey(pendingName, ver[1]));
  }

  // snapshots: only `dependencies:` edges
  const s = lines.findIndex((l) => l === 'snapshots:');
  let cur: string | null = null;
  let sub = '';
  for (let n = s + 1; n < lines.length; n++) {
    const l = lines[n];
    if (/^\S/.test(l)) break;
    const k = /^ {2}(\S.*?):(?: \{\})?$/.exec(l);
    if (k) { cur = unquote(k[1]); sub = ''; edges.set(cur, []); continue; }
    const sec = /^ {4}(\w+):$/.exec(l);
    if (sec) { sub = sec[1]; continue; }
    const dep = /^ {6}(\S.*?): (.+)$/.exec(l);
    if (dep && cur && sub === 'dependencies') edges.get(cur)!.push(toKey(unquote(dep[1]), dep[2]));
  }
  return { importerDeps, edges };
}

function reachable(g: Graph): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const stack: Array<[string, string[]]> = g.importerDeps.map((k) => [k, [k]]);
  while (stack.length) {
    const [k, path] = stack.pop()!;
    if (seen.has(k)) continue;
    seen.set(k, path);
    for (const d of g.edges.get(k) ?? []) if (!seen.has(d)) stack.push([d, [...path, d]]);
  }
  return seen;
}

describe('D9: no scraping or browser automation dependency in apps/web (pnpm-lock.yaml)', () => {
  const text = readFileSync(LOCK, 'utf8');
  const graph = parseLock(text);
  const seen = reachable(graph);

  it('the walker is not vacuous: it finds the importer deps and a deep transitive closure', () => {
    expect(graph.importerDeps.length).toBeGreaterThan(30);
    expect(graph.importerDeps.some((k) => nameOf(k) === '@anthropic-ai/sdk')).toBe(true);
    // a known transitive dependency of @anthropic-ai/sdk
    expect([...seen.keys()].some((k) => nameOf(k) === 'json-schema-to-ts')).toBe(true);
    expect(seen.size).toBeGreaterThan(300);
    // every edge target resolves to a snapshot (parser keys match lockfile keys)
    let dangling = 0;
    for (const k of seen.keys()) if (!graph.edges.has(k)) dangling++;
    expect(dangling).toBeLessThan(seen.size * 0.02);
  });

  it('the name matcher flags what it must', () => {
    for (const n of ['puppeteer', 'puppeteer-core', 'playwright', 'playwright-core', '@playwright/test', 'selenium-webdriver', 'cheerio', '@puppeteer/browsers', '@wdio/utils']) expect(bannedMatch(n), n).toBe(true);
    for (const n of ['react', '@anthropic-ai/sdk', 'zod', '@vitest/browser-playwright-not-matched-by-scope']) expect(bannedMatch(n), n).toBe(false);
  });

  it('no direct dependency or devDependency is a scraping/browser automation package', () => {
    expect(graph.importerDeps.map(nameOf).filter(bannedMatch)).toEqual([]);
  });

  it('no non-optional transitive dependency is a scraping/browser automation package', () => {
    const hits = [...seen.entries()].filter(([k]) => bannedMatch(nameOf(k))).map(([k, path]) => `${k} via ${path.map(nameOf).join(' > ')}`);
    expect(hits).toEqual([]);
  });
});

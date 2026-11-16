/**
 * Item 27: proxy.ts lets /api/integrations/marcus/* skip the login wall and CSRF check because each route checks a
 * bearer token itself. So every route file under that folder must reject a missing or wrong token, and the proxy's
 * exemption pattern must match exactly the routes that exist and nothing else.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const ROOT = path.resolve(__dirname, '../../app/api/integrations/marcus');
const MARCUS_ROUTE = new RegExp(/^\/api\/integrations\/marcus\/(tasks(\/[A-Za-z0-9]{1,64}(\/(confirm|resume))?)?|events|freeze|unfreeze)$/.source);
const proxySrc = readFileSync(path.resolve(__dirname, '../../proxy.ts'), 'utf8');

function routes(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const f = path.join(dir, n);
    if (statSync(f).isDirectory()) routes(f, out); else if (n === 'route.ts') out.push(f);
  }
  return out;
}
const toPath = (f: string) => '/api/integrations/marcus/' + path.relative(ROOT, path.dirname(f)).replace(/\[id\]/g, 'abc123');

describe('Marcus routes exempt from the login wall', () => {
  it('uses the same exemption pattern as proxy.ts', () => {
    expect(proxySrc).toContain(MARCUS_ROUTE.source);
  });
  it('matches every route that exists, and nothing nearby', () => {
    for (const f of routes(ROOT)) expect(MARCUS_ROUTE.test(toPath(f)), toPath(f)).toBe(true);
    for (const p of ['/api/integrations/marcus', '/api/integrations/marcus/tasks/x/y/z', '/api/integrations/marcus/../approvals', '/api/integrations/marcus/events/', '/api/integrations/marcus/tasksX', '/api/integrations/other'])
      expect(MARCUS_ROUTE.test(p), p).toBe(false);
  });
  it('rejects a missing or wrong bearer token on every method of every route before doing anything else', async () => {
    vi.stubEnv('MARCUS_BEARER_TOKEN_HASH', 'a'.repeat(64));
    for (const f of routes(ROOT)) {
      const mod = await import(f);
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => typeof mod[m] === 'function');
      expect(methods.length, f).toBeGreaterThan(0);
      for (const m of methods) {
        for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: 'Basic abc' }] as Record<string, string>[]) {
          const res = await mod[m](new Request('http://localhost' + toPath(f), { method: m, headers, body: m === 'GET' ? undefined : '{}' }), { params: Promise.resolve({ id: 'abc123' }) });
          expect(res.status, `${m} ${toPath(f)} ${JSON.stringify(headers)}`).toBe(401);
        }
      }
    }
  });
  it('fails closed when no token hash is configured', async () => {
    vi.stubEnv('MARCUS_BEARER_TOKEN_HASH', '');
    const mod = await import(path.join(ROOT, 'freeze/route.ts'));
    const res = await mod.POST(new Request('http://localhost/x', { method: 'POST', headers: { authorization: 'Bearer anything' } }));
    expect(res.status).toBe(401);
  });
});

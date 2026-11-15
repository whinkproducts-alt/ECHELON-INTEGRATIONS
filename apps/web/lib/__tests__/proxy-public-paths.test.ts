import { describe, it, expect, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: (fn: any) => fn }));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';

const run = (path: string, authed = false, method = 'GET') => {
  const r: any = new NextRequest(`http://localhost${path}`, { method, headers: { 'sec-fetch-site': 'same-origin' } });
  r.auth = authed ? { user: { id: 'u1' } } : null;
  return (proxy as any)(r) as Promise<Response>;
};

describe('proxy public paths', () => {
  it.each(['/', '/terms', '/privacy', '/forgot-password', '/reset-password'])('%s is reachable signed out', async (p) => {
    const res = await run(p);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('password API routes are not redirected', async () => {
    for (const p of ['/api/auth/password/forgot', '/api/auth/password/reset']) {
      const res = await run(p, false, 'GET');
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('protected paths still redirect to /login', async () => {
    for (const p of ['/dashboard', '/settings', '/terms-of-anything']) {
      const res = await run(p);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    }
  });

  it('Marcus bearer routes skip the login wall and CSRF, and nothing near them does', async () => {
    const bare = (path: string, method: string) => {
      const r: any = new NextRequest(`http://localhost${path}`, { method }); // no Origin, no Sec-Fetch-Site, like a Python client
      r.auth = null;
      return (proxy as any)(r) as Promise<Response>;
    };
    for (const [path, method] of [['/api/integrations/marcus/tasks', 'POST'], ['/api/integrations/marcus/tasks/abc123', 'GET'], ['/api/integrations/marcus/tasks/abc123/confirm', 'POST'], ['/api/integrations/marcus/tasks/abc123/resume', 'POST'], ['/api/integrations/marcus/events', 'GET'], ['/api/integrations/marcus/freeze', 'POST'], ['/api/integrations/marcus/unfreeze', 'POST']]) {
      const res = await bare(path, method);
      expect(res.status, `${method} ${path}`).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    }
    for (const path of ['/api/integrations/marcus', '/api/integrations/marcus/other', '/api/integrations/marcus/tasks/a/b/c', '/api/integrations/marcus/tasks/..%2Fgrants', '/api/integrations/providers']) {
      const res = await bare(path, 'GET');
      expect(res.status, path).toBe(307);
    }
    expect((await bare('/api/integrations/providers', 'POST')).status).toBe(403);
  });

  it('signed-in visitor to / passes through', async () => {
    expect((await run('/', true)).headers.get('location')).toBeNull();
  });
});

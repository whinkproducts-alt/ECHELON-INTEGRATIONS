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

  it('signed-in visitor to / passes through', async () => {
    expect((await run('/', true)).headers.get('location')).toBeNull();
  });
});

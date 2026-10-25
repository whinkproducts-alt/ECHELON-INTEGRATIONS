import { describe, it, expect, vi, beforeEach } from 'vitest';
import { securityHeaders } from '../security-headers';

describe('securityHeaders', () => {
  it('sets the required headers', () => {
    const h = securityHeaders({ https: false });
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBeTruthy();
    expect(h['Permissions-Policy']).toContain('camera=(self)');
    expect(h['Permissions-Policy']).toContain('microphone=(self)');
    expect(h['Permissions-Policy']).toContain('geolocation=()');
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(h['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(h['Strict-Transport-Security']).toBeUndefined();
  });
  it('adds HSTS only for https deployments', () => {
    expect(securityHeaders({ https: true })['Strict-Transport-Security']).toContain('max-age=');
  });
});

describe('proxy.ts applies headers and rate limits', () => {
  beforeEach(() => vi.resetModules());
  async function load() {
    vi.doMock('@/auth', () => ({ auth: (fn: unknown) => fn }));
    const mod = await import('../../proxy');
    const { NextRequest } = await import('next/server');
    return { mw: mod.default as unknown as (r: InstanceType<typeof NextRequest>) => Promise<Response>, NextRequest };
  }
  it('every response carries the security headers and a nonce CSP with frame-ancestors none', async () => {
    const { mw, NextRequest } = await load();
    const res = await mw(new NextRequest('http://localhost:3000/login'));
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
  it('rate limits repeated sign-in POSTs from one client address', async () => {
    const { mw, NextRequest } = await load();
    const mk = () => new NextRequest('http://localhost:3000/api/auth/callback/credentials', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'x-forwarded-for': '9.9.9.9' },
    });
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await mw(mk())).status;
    expect(last).toBe(429);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { securityHeaders, applySecurityHeaders, wantsNoReferrer } from '../security-headers';

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
  it('rate limits repeated sign-in POSTs for one account even with rotating spoofed XFF', async () => {
    const { mw, NextRequest } = await load();
    let last = 200;
    for (let i = 0; i < 10; i++) {
      const body = new URLSearchParams({ email: 'victim@example.com', password: 'x' });
      last = (await mw(new NextRequest('http://localhost:3000/api/auth/callback/credentials', {
        method: 'POST', body,
        headers: { origin: 'http://localhost:3000', 'x-forwarded-for': `9.9.9.${i}`, 'content-type': 'application/x-www-form-urlencoded' },
      }))).status;
    }
    expect(last).toBe(429);
  });

  it('sends no Referer from the token pages, including encoded and trailing-slash forms, and only there', () => {
    for (const p of ['/reset-password', '/reset-password/', '/forgot-password', '/%72eset-password', '/RESET-PASSWORD']) {
      expect(wantsNoReferrer(p)).toBe(true);
      expect(securityHeaders({ https: false, pathname: p })['Referrer-Policy']).toBe('no-referrer');
    }
    for (const p of ['/', '/login', '/dashboard', '/reset-password-help', undefined]) {
      expect(securityHeaders({ https: false, pathname: p })['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    }
  });

  it('applySecurityHeaders overwrites any earlier Referrer-Policy with the per-page one', () => {
    const res = new Response('x', { headers: { 'Referrer-Policy': 'strict-origin-when-cross-origin' } });
    applySecurityHeaders(res, { https: false, pathname: '/reset-password' });
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
  });
});

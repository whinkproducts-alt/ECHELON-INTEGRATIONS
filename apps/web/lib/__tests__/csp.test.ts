import { describe, it, expect } from 'vitest';
import { buildCsp, generateNonce } from '@/lib/csp';

describe('buildCsp', () => {
  const prod = buildCsp({ nonce: 'abc', isDev: false });
  const dev = buildCsp({ nonce: 'abc', isDev: true });

  it('is nonce-based with no script unsafe-inline, and no unsafe-eval in production', () => {
    const script = prod.split('; ').find((d) => d.startsWith('script-src'))!;
    expect(script).toContain("'nonce-abc'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain('unsafe-inline');
    expect(script).not.toContain('unsafe-eval');
  });
  it('allows unsafe-eval only in development and upgrade-insecure-requests only in production', () => {
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain('upgrade-insecure-requests');
    expect(prod).toContain('upgrade-insecure-requests');
  });
  it('locks down framing, plugins, base, forms and browser connections', () => {
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'", "connect-src 'self'"]) {
      expect(prod).toContain(d);
    }
    expect(prod).not.toMatch(/https?:\/\//);
  });
  it('generates a fresh nonce each call', () => {
    expect(generateNonce()).not.toBe(generateNonce());
    expect(generateNonce()).toMatch(/^[A-Za-z0-9+/=]{20,}$/);
  });
});

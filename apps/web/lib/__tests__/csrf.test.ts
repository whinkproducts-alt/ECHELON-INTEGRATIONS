import { describe, it, expect } from 'vitest';
import { checkCsrf, type CsrfInput } from '../csrf';

const base: CsrfInput = {
  method: 'POST',
  pathname: '/api/approvals/ap1/decision',
  secFetchSite: null,
  origin: null,
  host: 'app.example.com',
  proto: 'https',
  requestOrigin: 'https://app.example.com',
  configuredUrl: null,
};
const run = (o: Partial<CsrfInput>) => checkCsrf({ ...base, ...o });

describe('checkCsrf', () => {
  it('allows safe methods without headers', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) expect(run({ method }).ok).toBe(true);
  });

  it('ignores non-api paths', () => {
    expect(run({ pathname: '/dashboard' }).ok).toBe(true);
  });

  it('leaves /api/auth/** to NextAuth', () => {
    expect(run({ pathname: '/api/auth/callback/credentials' }).ok).toBe(true);
    expect(run({ pathname: '/api/auth/signout' }).ok).toBe(true);
    expect(run({ pathname: '/api/authors' }).ok).toBe(false);
  });

  it('allows Sec-Fetch-Site same-origin on every state-changing method', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(run({ method, secFetchSite: 'same-origin' }).ok).toBe(true);
    }
  });

  it('rejects any other Sec-Fetch-Site value, even with a matching Origin', () => {
    for (const v of ['cross-site', 'same-site', 'none']) {
      expect(run({ secFetchSite: v, origin: 'https://app.example.com' }).ok).toBe(false);
    }
  });

  it('falls back to Origin when Sec-Fetch-Site is absent', () => {
    expect(run({ origin: 'https://app.example.com' }).ok).toBe(true);
    expect(run({ origin: 'https://evil.example' }).ok).toBe(false);
    expect(run({ origin: 'http://app.example.com' }).ok).toBe(false);
    expect(run({ origin: 'null' }).ok).toBe(false);
    expect(run({ origin: 'not a url' }).ok).toBe(false);
  });

  it('rejects when both headers are absent', () => {
    expect(run({}).ok).toBe(false);
  });

  it('honours the configured auth URL and the forwarded host', () => {
    expect(run({ origin: 'https://whink.example.org', configuredUrl: 'https://whink.example.org/' }).ok).toBe(true);
    expect(run({ origin: 'https://public.example.com', requestOrigin: 'http://localhost:3000', host: 'public.example.com', proto: 'https' }).ok).toBe(true);
    expect(run({ origin: 'https://evil.example', requestOrigin: 'http://localhost:3000', host: 'public.example.com' }).ok).toBe(false);
  });
});

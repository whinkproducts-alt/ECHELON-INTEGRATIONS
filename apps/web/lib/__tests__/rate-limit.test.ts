import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRateLimitStore, checkRateLimit, limitOr429, limitAuthRequest, setRateLimitStore, RATE_RULES, clientKey, trustedHops } from '../rate-limit';

describe('sliding window rate limiter', () => {
  const rule = { limit: 3, windowMs: 1000 };
  it('allows up to the limit then rejects with retry-after', () => {
    const s = new InMemoryRateLimitStore();
    expect(s.hit('k', rule, 0).allowed).toBe(true);
    expect(s.hit('k', rule, 100).allowed).toBe(true);
    expect(s.hit('k', rule, 200).remaining).toBe(0);
    const r = s.hit('k', rule, 300);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBe(700);
  });
  it('window slides: old hits expire', () => {
    const s = new InMemoryRateLimitStore();
    for (const t of [0, 10, 20]) s.hit('k', rule, t);
    expect(s.hit('k', rule, 500).allowed).toBe(false);
    expect(s.hit('k', rule, 1001).allowed).toBe(true);
  });
  it('rejected hits are not stored (no self-extending lockout)', () => {
    const s = new InMemoryRateLimitStore();
    for (const t of [0, 1, 2]) s.hit('k', rule, t);
    for (let i = 0; i < 50; i++) s.hit('k', rule, 500);
    expect(s.hit('k', rule, 1003).allowed).toBe(true);
  });
  it('keys are independent (tenant isolation of buckets)', () => {
    const s = new InMemoryRateLimitStore();
    for (const t of [0, 1, 2]) s.hit('userA', rule, t);
    expect(s.hit('userA', rule, 3).allowed).toBe(false);
    expect(s.hit('userB', rule, 3).allowed).toBe(true);
  });
});

describe('named buckets', () => {
  beforeEach(() => setRateLimitStore(new InMemoryRateLimitStore()));
  it('returns a 429 Response after the comms limit, scoped per subject', async () => {
    for (let i = 0; i < RATE_RULES.comms.limit; i++) expect(await limitOr429('comms', 'u1')).toBeNull();
    const res = await limitOr429('comms', 'u1');
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await limitOr429('comms', 'u2')).toBeNull();
    expect(await limitOr429('import', 'u1')).toBeNull();
  });
  it('refuses an empty subject', async () => {
    await expect(checkRateLimit('auth', '')).rejects.toThrow();
  });
  it('X-Forwarded-For is ignored unless TRUSTED_PROXY_HOPS is set (spoofing cannot dodge the limit)', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' });
    expect(clientKey(h, 0)).toBeNull();
    expect(trustedHops({})).toBe(0);
    expect(trustedHops({ TRUSTED_PROXY_HOPS: 'abc' })).toBe(0);
    expect(trustedHops({ TRUSTED_PROXY_HOPS: '1' })).toBe(1);
  });
  it('with trusted hops the Nth address from the right is used, not the client-supplied left one', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' });
    expect(clientKey(h, 1)).toBe('1.2.3.4');
    expect(clientKey(h, 2)).toBe('6.6.6.6');
    expect(clientKey(h, 3)).toBeNull();
    expect(clientKey(new Headers({ 'x-forwarded-for': 'not an ip' }), 1)).toBeNull();
  });
  it('rotating spoofed XFF values does not reset the bucket when untrusted', async () => {
    let last: Response | null = null;
    for (let i = 0; i < RATE_RULES.auth_route.limit + 1; i++) {
      last = await limitAuthRequest('auth', new Headers({ 'x-forwarded-for': `10.0.0.${i % 250}` }));
    }
    expect(last?.status).toBe(429);
  });
  it('per-account bucket limits one email across addresses; other accounts unaffected', async () => {
    let r: Response | null = null;
    for (let i = 0; i < RATE_RULES.auth_account.limit + 1; i++) r = await limitAuthRequest('auth', new Headers(), 'Victor@Example.com');
    expect(r?.status).toBe(429);
    expect(await limitAuthRequest('auth', new Headers(), 'someone.else@example.com')).toBeNull();
  });
});

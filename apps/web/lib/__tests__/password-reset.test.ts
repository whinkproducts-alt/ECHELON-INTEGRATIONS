import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  users: [] as any[],
  tokens: [] as any[],
  ledger: [] as any[],
  sv: {} as Record<string, number>,
  seq: 0,
  deliver: vi.fn(),
  warns: [] as string[],
}));

const matches = (r: any, w: any) =>
  Object.entries(w).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('gt' in v) return r[k] > v.gt;
      if ('not' in v) return r[k] !== v.not;
    }
    return r[k] === v;
  });

vi.mock('@/lib/db', () => {
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => h.users.find((u) => u.email === where.email || u.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const u = h.users.find((x) => x.id === where.id);
        if (data.passwordHash) u.passwordHash = data.passwordHash;
        if (data.sessionVersion) { h.sv[u.id] = (h.sv[u.id] ?? 0) + 1; return { sessionVersion: h.sv[u.id] }; }
        return u;
      },
    },
    userProfile: { findUnique: async () => ({ autonomyLevel: 1 }) },
    delegation: { findFirst: async () => null },
    passwordResetToken: {
      create: async ({ data }: any) => { const r = { id: `t${++h.seq}`, usedAt: null, createdAt: new Date(), ...data }; h.tokens.push(r); return r; },
      findUnique: async ({ where }: any) => h.tokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
      findFirst: async ({ where }: any) => h.tokens.find((t) => matches(t, where)) ?? null,
      updateMany: async ({ where, data }: any) => {
        const rows = h.tokens.filter((t) => matches(t, where));
        rows.forEach((t) => Object.assign(t, data));
        return { count: rows.length };
      },
    },
  };
  prisma.$transaction = async (fn: any) => {
    const snap = JSON.stringify([h.users, h.tokens, h.sv]);
    try { return await fn(prisma); } catch (e) {
      const [u, t, s] = JSON.parse(snap, (k, v) => (k === 'expiresAt' || k === 'createdAt' || k === 'usedAt') && v ? new Date(v) : v);
      h.users.splice(0, h.users.length, ...u); h.tokens.splice(0, h.tokens.length, ...t); h.sv = s; throw e;
    }
  };
  return { prisma };
});
vi.mock('@/lib/ledger', () => ({ writeLedger: async (e: any) => { h.ledger.push(e); return { id: 'l' }; }, recordAction: async () => ({ id: 'l' }) }));
vi.mock('@/lib/comms/delivery', () => ({ deliver: (p: any) => h.deliver(p) }));
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: (m: string) => { h.warns.push(m); }, error: () => {}, security: () => {}, info: () => {},
  },
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => { void fn(); } }));
vi.mock('@/auth', () => ({ auth: async () => null }));
vi.mock('bcryptjs', () => ({ default: { hash: async (p: string) => `bc:${p}`, compare: async () => true } }));

import { NextRequest } from 'next/server';
import { setRateLimitStore, InMemoryRateLimitStore } from '@/lib/rate-limit';
import { clearSessionVersionCache } from '@/lib/auth/session-version';
import { checkPermission, CAPABILITY_CLASSES } from '@/lib/permission-engine';
import { classifyProtected } from '@/lib/protected-actions';
import { hashToken, issueAndSend, RESET_TTL_MS } from '@/lib/auth/password-reset';
import { POST as forgot } from '@/app/api/auth/password/forgot/route';
import { POST as reset } from '@/app/api/auth/password/reset/route';

const req = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const flush = () => new Promise((r) => setTimeout(r, 10));

async function mintToken(email = 'a@x.test'): Promise<string> {
  h.deliver.mockClear();
  await issueAndSend(email);
  const body: string = h.deliver.mock.calls.at(-1)![0].body;
  return /token=([\w-]+)/.exec(body)![1];
}

beforeEach(() => {
  h.users.splice(0, h.users.length, { id: 'u1', email: 'a@x.test', passwordHash: 'old' }, { id: 'u2', email: 'b@x.test', passwordHash: 'old' }, { id: 'u3', email: 'oauth@x.test', passwordHash: null });
  h.tokens.length = 0; h.ledger.length = 0; h.warns.length = 0; h.sv = {};
  h.deliver.mockReset().mockResolvedValue({ sent: true, channel: 'EMAIL' });
  setRateLimitStore(new InMemoryRateLimitStore());
  clearSessionVersionCache();
  process.env.SMTP_HOST = 'smtp.test';
  process.env.AUTH_URL = 'https://app.test';
});
afterEach(() => { vi.useRealTimers(); });

describe('forgot', () => {
  it('returns identical 200 for known, unknown and password-less accounts', async () => {
    const res = [];
    for (const e of ['a@x.test', 'nobody@x.test', 'oauth@x.test']) {
      const r = await forgot(req('/api/auth/password/forgot', { email: e }));
      res.push([r.status, await r.json()]);
    }
    await flush();
    expect(res.every((x) => x[0] === 200 && x[1].ok === true && Object.keys(x[1]).length === 1)).toBe(true);
    expect(h.deliver).toHaveBeenCalledTimes(1);
  });

  it('stores only the hash, mails the link, ledger has no email or token', async () => {
    const token = await mintToken();
    expect(h.tokens).toHaveLength(1);
    expect(h.tokens[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(h.tokens)).not.toContain(token);
    expect(h.tokens[0].expiresAt.getTime() - h.tokens[0].createdAt.getTime()).toBeLessThanOrEqual(RESET_TTL_MS + 1000);
    expect(h.deliver.mock.calls[0][0].to).toBe('a@x.test');
    const l = JSON.stringify(h.ledger);
    expect(l).not.toContain(token); expect(l).not.toContain('a@x.test'); expect(l).toContain('u1');
  });

  it('a fresh valid token (under 60 s) is not retired or replaced and nothing new is sent', async () => {
    const t1 = await mintToken();
    h.deliver.mockClear();
    await issueAndSend('a@x.test');
    expect(h.deliver).not.toHaveBeenCalled();
    expect(h.tokens).toHaveLength(1);
    expect((await reset(req('/api/auth/password/reset', { token: t1, password: 'newpassword1' }))).status).toBe(200);
  });

  it('per-email bucket throttles silently with the same 200', async () => {
    const out = [];
    for (let i = 0; i < 6; i++) { const r = await forgot(req('/api/auth/password/forgot', { email: 'b@x.test' })); out.push([r.status, await r.json()]); }
    expect(out.every((x) => x[0] === 200 && x[1].ok === true)).toBe(true);
  });

  it('a new token after 60 s invalidates earlier unused ones', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    const t1 = await mintToken();
    vi.setSystemTime(new Date('2026-10-27T10:01:01Z'));
    const t2 = await mintToken();
    expect((await reset(req('/api/auth/password/reset', { token: t1, password: 'newpassword1' }))).status).toBe(400);
    expect((await reset(req('/api/auth/password/reset', { token: t2, password: 'newpassword1' }))).status).toBe(200);
  });

  it('SMTP missing: still 200, one clear log line without address or link', async () => {
    delete process.env.SMTP_HOST;
    const r = await forgot(req('/api/auth/password/forgot', { email: 'a@x.test' }));
    await flush();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(h.warns).toEqual(['password reset email not sent: SMTP not configured']);
    expect(h.deliver).not.toHaveBeenCalled();
  });

  it('rate limits per client address with 429', async () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await forgot(new NextRequest('http://localhost/api/auth/password/forgot', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
        body: JSON.stringify({ email: `x${i}@x.test` }),
      }))).status;
    }
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(last).toBe(429);
  });

  it('rejects malformed bodies', async () => {
    expect((await forgot(req('/api/auth/password/forgot', { nope: 1 }))).status).toBe(400);
  });
});

describe('reset', () => {
  it('succeeds, sets the hash, bumps sessionVersion, ledgers without PII', async () => {
    const token = await mintToken();
    h.ledger.length = 0;
    const r = await reset(req('/api/auth/password/reset', { token, password: 'newpassword1' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(h.users[0].passwordHash).toBe('bc:newpassword1');
    expect(h.sv.u1).toBe(1);
    expect(h.ledger).toHaveLength(1);
    expect(h.ledger[0]).toMatchObject({ userId: 'u1', initiator: 'user', action: 'password_reset' });
    const l = JSON.stringify(h.ledger);
    expect(l).not.toContain(token); expect(l).not.toContain('a@x.test'); expect(l).not.toContain('newpassword1');
  });

  it('weak password gives 400 weak_password and does not burn the token', async () => {
    const token = await mintToken();
    const r = await reset(req('/api/auth/password/reset', { token, password: 'short' }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'weak_password' });
    expect((await reset(req('/api/auth/password/reset', { token, password: 'newpassword1' }))).status).toBe(200);
  });

  it('bad, used and unknown tokens all give the same generic error', async () => {
    const token = await mintToken();
    await reset(req('/api/auth/password/reset', { token, password: 'newpassword1' }));
    for (const t of [token, 'unknown-token']) {
      const r = await reset(req('/api/auth/password/reset', { token: t, password: 'newpassword1' }));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'invalid_or_expired' });
    }
  });

  it('10 concurrent resets: exactly one succeeds', async () => {
    const token = await mintToken();
    const rs = await Promise.all(Array.from({ length: 10 }, () => reset(req('/api/auth/password/reset', { token, password: 'newpassword1' }))));
    const ok = rs.filter((r) => r.status === 200).length;
    expect(ok).toBe(1);
    expect(h.sv.u1).toBe(1);
  });

  it('expiry: 29m59s works, 30m01s fails (controlled clock)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    const t1 = await mintToken();
    vi.setSystemTime(new Date('2026-10-27T10:29:59Z'));
    expect((await reset(req('/api/auth/password/reset', { token: t1, password: 'newpassword1' }))).status).toBe(200);
    vi.setSystemTime(new Date('2026-10-27T11:00:00Z'));
    const t2 = await mintToken('b@x.test');
    vi.setSystemTime(new Date('2026-10-27T11:30:01Z'));
    const r = await reset(req('/api/auth/password/reset', { token: t2, password: 'newpassword1' }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_or_expired' });
  });

  it("another user's token only resets its own owner", async () => {
    const tb = await mintToken('b@x.test');
    await reset(req('/api/auth/password/reset', { token: tb, password: 'newpassword1' }));
    expect(h.users[0].passwordHash).toBe('old');
    expect(h.users[1].passwordHash).toBe('bc:newpassword1');
    expect(h.sv.u1).toBeUndefined();
    expect(h.sv.u2).toBe(1);
  });

  it('a failing session bump rolls back the password and the token', async () => {
    const token = await mintToken();
    const { prisma } = await import('@/lib/db');
    const realUpdate = (prisma as any).user.update;
    (prisma as any).user.update = async (a: any) => { if (a.data.sessionVersion) throw new Error('boom'); return realUpdate(a); };
    const r = await reset(req('/api/auth/password/reset', { token, password: 'newpassword1' }));
    (prisma as any).user.update = realUpdate;
    expect(r.status).toBe(500);
    expect(h.users[0].passwordHash).toBe('old');
    expect(h.tokens.find((t) => t.tokenHash === hashToken(token))!.usedAt).toBeNull();
    expect((await reset(req('/api/auth/password/reset', { token, password: 'newpassword1' }))).status).toBe(200);
  });

  it('rate limit gives 429', async () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const r = new NextRequest('http://localhost/api/auth/password/reset', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ token: `t${i}`, password: 'newpassword1' }),
      });
      last = (await reset(r)).status;
    }
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(last).toBe(429);
  });
});

describe('password_reset_email capability', () => {
  it('is Class A, allowed, and not protected', async () => {
    expect(CAPABILITY_CLASSES.password_reset_email).toBe('A');
    expect(classifyProtected({ toolName: 'password_reset_email', capability: 'password_reset_email' }).protected).toBe(false);
    expect((await checkPermission('u1', 'password_reset_email', 'A')).allowed).toBe(true);
  });
});

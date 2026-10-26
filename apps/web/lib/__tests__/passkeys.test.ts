import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as string | null,
  challenges: [] as any[],
  creds: [] as any[],
  ledger: [] as any[],
  seq: 0,
  sv: {} as Record<string, number>,
  pw: 'secret',
  verifyAuth: vi.fn(),
  verifyReg: vi.fn(),
}));

function match(row: any, where: any): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
      if ('gt' in v) return row[k] > v.gt;
      if ('lt' in v) return row[k] < v.lt;
      if ('not' in v) return row[k] !== v.not;
    }
    return row[k] === v;
  });
}

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: any) => ({ id: where.id, email: `${where.id}@x.test`, name: 'N', role: 'user', passwordHash: 'hash', sessionVersion: h.sv[where.id] ?? 0 }),
      update: async ({ where }: any) => { h.sv[where.id] = (h.sv[where.id] ?? 0) + 1; return { sessionVersion: h.sv[where.id] }; },
    },
    passkeyChallenge: {
      create: async ({ data }: any) => { const r = { id: `c${++h.seq}`, usedAt: null, ...data }; h.challenges.push(r); return r; },
      updateMany: async ({ where, data }: any) => {
        const rows = h.challenges.filter((r) => match(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      findUnique: async ({ where }: any) => h.challenges.find((r) => r.id === where.id) ?? null,
      count: async ({ where }: any) => h.challenges.filter((r) => match(r, where)).length,
      deleteMany: async ({ where }: any) => {
        const n = h.challenges.length;
        h.challenges = h.challenges.filter((r) => !(where.OR as any[]).some((w) => match(r, w)));
        return { count: n - h.challenges.length };
      },
    },
    passkeyCredential: {
      findMany: async ({ where, select }: any) =>
        h.creds.filter((c) => c.userId === where.userId).map((c) =>
          select ? Object.fromEntries(Object.keys(select).map((k) => [k, c[k]])) : c),
      findUnique: async ({ where }: any) => h.creds.find((c) => c.credentialId === where.credentialId) ?? null,
      findFirst: async ({ where }: any) => h.creds.find((c) => match(c, where)) ?? null,
      create: async ({ data }: any) => { const r = { id: `p${++h.seq}`, createdAt: new Date(), ...data }; h.creds.push(r); return r; },
      updateMany: async ({ where, data }: any) => {
        const rows = h.creds.filter((c) => match(c, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      deleteMany: async ({ where }: any) => {
        const n = h.creds.length;
        h.creds = h.creds.filter((c) => !match(c, where));
        return { count: n - h.creds.length };
      },
    },
  },
}));
vi.mock('@/auth', () => ({ auth: async () => (h.session ? { user: { id: h.session, remember: false } } : null) }));
vi.mock('bcryptjs', () => ({ default: { compare: async (p: string) => p === h.pw } }));
vi.mock('@/lib/ledger', () => ({ writeLedger: async (e: any) => { h.ledger.push(e); return { id: 'l' }; } }));
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: async () => ({ challenge: 'chal-reg' }),
  generateAuthenticationOptions: async () => ({ challenge: 'chal-login' }),
  verifyRegistrationResponse: h.verifyReg,
  verifyAuthenticationResponse: h.verifyAuth,
}));

import { POST as regOptions } from '@/app/api/auth/passkey/register/options/route';
import { POST as regVerify } from '@/app/api/auth/passkey/register/verify/route';
import { POST as loginOptions } from '@/app/api/auth/passkey/login/options/route';
import { POST as loginVerify } from '@/app/api/auth/passkey/login/verify/route';
import { GET as listKeys } from '@/app/api/auth/passkey/route';
import { DELETE as delKey } from '@/app/api/auth/passkey/[id]/route';
import { redeemLoginTicket, mintLoginTicket, TICKET_TTL_MS, CHALLENGE_TTL_MS, consumeChallenge, issueChallenge } from '@/lib/passkeys/challenges';
import { getWebAuthnConfig } from '@/lib/passkeys/config';
import { applyLifetime as applyLifetimeTyped, SESSION_TTL_SHORT_SECONDS, SESSION_TTL_REMEMBER_SECONDS, type LifetimeToken } from '@/lib/auth/session-lifetime';

const applyLifetime = (token: LifetimeToken, ...rest: [Parameters<typeof applyLifetimeTyped>[1], number]) => applyLifetimeTyped<LifetimeToken>(token, ...rest);
import { cleanupPasskeyChallenges, tooManyOpenChallenges, MAX_OPEN_CHALLENGES, mintReauthTicket, redeemReauthTicket } from '@/lib/passkeys/challenges';
import { setRateLimitStore, InMemoryRateLimitStore } from '@/lib/rate-limit';

const req = (url: string, body: unknown, method = 'POST') =>
  new Request(`http://localhost:3000${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: method !== 'POST' ? undefined : JSON.stringify(body),
  });

const delReq = (body: unknown) =>
  new Request('http://localhost:3000/api/auth/passkey/pk1', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  h.session = null; h.sv = {}; h.challenges = []; h.creds = []; h.ledger = []; h.seq = 0;
  h.verifyAuth.mockReset(); h.verifyReg.mockReset();
  process.env.WEBAUTHN_RP_ID = 'localhost';
  process.env.WEBAUTHN_ORIGIN = 'http://localhost:3000';
  process.env.AUTH_SECRET = 'test-secret';
  setRateLimitStore(new InMemoryRateLimitStore());
});

const seedCred = (over: any = {}) => {
  const c = { id: 'pk1', userId: 'u1', credentialId: 'cred1', publicKey: Buffer.from('k'), counter: 5n, transports: [], deviceName: 'Mac', backedUp: false, ...over };
  h.creds.push(c);
  return c;
};
const authOk = (newCounter: number) => h.verifyAuth.mockResolvedValue({ verified: true, authenticationInfo: { newCounter, userVerified: true } });
async function loginStart(remember = false) {
  const r = await loginOptions(req('/api/auth/passkey/login/options', { remember }));
  return (await r.json()).challengeId as string;
}
const assertion = (challengeId: string, extra: any = {}) =>
  req('/api/auth/passkey/login/verify', { challengeId, response: { id: 'cred1', response: { userHandle: Buffer.from('u1').toString('base64url') }, ...extra } });

describe('config', () => {
  it('refuses non-https origins except localhost, and unset config', () => {
    expect(() => getWebAuthnConfig({})).toThrow();
    expect(() => getWebAuthnConfig({ WEBAUTHN_RP_ID: 'a.com', WEBAUTHN_ORIGIN: 'http://a.com' })).toThrow();
    expect(() => getWebAuthnConfig({ WEBAUTHN_RP_ID: 'a.com', WEBAUTHN_ORIGIN: 'https://evil.com' })).toThrow();
    const ok = getWebAuthnConfig({ WEBAUTHN_RP_ID: 'a.com', WEBAUTHN_ORIGIN: 'https://a.com, https://app.a.com' });
    expect(ok.origins).toEqual(['https://a.com', 'https://app.a.com']);
    expect(ok.rpName).toBe('Whink Ultimate');
    expect(getWebAuthnConfig({ WEBAUTHN_RP_ID: 'localhost', WEBAUTHN_ORIGIN: 'http://localhost:3000' }).rpID).toBe('localhost');
  });
});

describe('login flow', () => {
  it('success path mints a ticket, updates counter, ledgers passkey_login', async () => {
    seedCred();
    authOk(6);
    const id = await loginStart(true);
    const res = await loginVerify(assertion(id));
    expect(res.status).toBe(200);
    const { ticket } = await res.json();
    expect(h.creds[0].counter).toBe(6n);
    expect(h.ledger.some((l) => l.action === 'passkey_login' && l.userId === 'u1')).toBe(true);
    expect(JSON.stringify(h.ledger)).not.toContain('chal-login');
    expect(await redeemLoginTicket(ticket)).toEqual({ userId: 'u1', remember: true });
  });

  it('ticket cannot be minted without a verified assertion', async () => {
    seedCred();
    h.verifyAuth.mockResolvedValue({ verified: false });
    const id = await loginStart();
    const res = await loginVerify(assertion(id));
    expect(res.status).toBe(401);
    expect(h.challenges.filter((c) => c.purpose === 'login_ticket')).toHaveLength(0);
  });

  it('replayed ticket is rejected, forged and expired tickets too', async () => {
    const t = await mintLoginTicket('u1', false, 1_000);
    expect(await redeemLoginTicket(t, 1_000 + 1)).toEqual({ userId: 'u1', remember: false });
    expect(await redeemLoginTicket(t, 1_000 + 2)).toBeNull();
    const t2 = await mintLoginTicket('u1', false, 1_000);
    expect(await redeemLoginTicket(t2, 1_000 + TICKET_TTL_MS + 1)).toBeNull();
    const t3 = await mintLoginTicket('u1', false, 1_000);
    expect(await redeemLoginTicket(t3.slice(0, -2) + 'xx', 1_001)).toBeNull();
    expect(await redeemLoginTicket('garbage', 1_001)).toBeNull();
    expect(await redeemLoginTicket(undefined)).toBeNull();
  });

  it('expired challenge and challenge reuse are rejected', async () => {
    const a = await issueChallenge('login', 'x', { now: 1_000 });
    expect(await consumeChallenge(a, 'login', { now: 1_000 + CHALLENGE_TTL_MS + 1 })).toBeNull();
    const b = await issueChallenge('login', 'y', { now: 1_000 });
    expect(await consumeChallenge(b, 'login', { now: 2_000 })).toMatchObject({ challenge: 'y' });
    expect(await consumeChallenge(b, 'login', { now: 2_001 })).toBeNull();
    seedCred();
    authOk(6);
    const id = await loginStart();
    expect((await loginVerify(assertion(id))).status).toBe(200);
    expect((await loginVerify(assertion(id))).status).toBe(401);
  });

  it('counter replay is rejected and ledgered as a security event', async () => {
    seedCred({ counter: 5n });
    authOk(5);
    const id = await loginStart();
    expect((await loginVerify(assertion(id))).status).toBe(401);
    expect(h.ledger.some((l) => l.action === 'SECURITY_EVENT:passkey_replay')).toBe(true);
    expect(h.creds[0].counter).toBe(5n);
  });

  it('counter zero on both sides is allowed (authenticators without counters)', async () => {
    seedCred({ counter: 0n });
    authOk(0);
    expect((await loginVerify(assertion(await loginStart()))).status).toBe(200);
  });

  it('wrong origin is rejected with a security event', async () => {
    seedCred();
    h.verifyAuth.mockRejectedValue(new Error('Unexpected authentication response origin "https://evil.com"'));
    expect((await loginVerify(assertion(await loginStart()))).status).toBe(401);
    expect(h.ledger.some((l) => l.action === 'SECURITY_EVENT:passkey_origin_mismatch')).toBe(true);
  });

  it('unknown credential is a 401 and does not call verification', async () => {
    const id = await loginStart();
    const res = await loginVerify(req('/api/auth/passkey/login/verify', { challengeId: id, response: { id: 'nope' } }));
    expect(res.status).toBe(401);
    expect(h.verifyAuth).not.toHaveBeenCalled();
  });

  it('user handle that does not match the credential owner is rejected', async () => {
    seedCred();
    authOk(6);
    const id = await loginStart();
    const res = await loginVerify(req('/api/auth/passkey/login/verify', {
      challengeId: id, response: { id: 'cred1', response: { userHandle: Buffer.from('u2').toString('base64url') } },
    }));
    expect(res.status).toBe(401);
    expect(h.verifyAuth).not.toHaveBeenCalled();
  });

  it('userVerified false is rejected', async () => {
    seedCred();
    h.verifyAuth.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 9, userVerified: false } });
    expect((await loginVerify(assertion(await loginStart()))).status).toBe(401);
  });

  it('cross-site request is refused (CSRF)', async () => {
    const r = new Request('http://localhost:3000/api/auth/passkey/login/options', {
      method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: '{}',
    });
    expect((await loginOptions(r)).status).toBe(403);
  });
});

describe('registration and management', () => {
  it('requires a session', async () => {
    expect((await regOptions(req('/api/auth/passkey/register/options', { password: 'secret' }))).status).toBe(401);
    expect((await listKeys(req('/api/auth/passkey', null, 'GET') as any)).status).toBe(401);
  });

  it('register happy path ledgers passkey_registered; challenge is single use and bound to the user', async () => {
    h.session = 'u1';
    h.verifyReg.mockResolvedValue({
      verified: true,
      registrationInfo: { userVerified: true, credentialBackedUp: true, credential: { id: 'newcred', publicKey: new Uint8Array([1]), counter: 0, transports: ['internal'] } },
    });
    const o = await (await regOptions(req('/api/auth/passkey/register/options', { password: 'secret' }))).json();
    const body = { challengeId: o.challengeId, deviceName: 'MacBook', response: { id: 'newcred' } };
    const res = await regVerify(req('/api/auth/passkey/register/verify', body));
    expect(res.status).toBe(201);
    expect(JSON.stringify(await res.json())).not.toMatch(/publicKey/);
    expect(h.ledger.some((l) => l.action === 'passkey_registered')).toBe(true);
    expect((await regVerify(req('/api/auth/passkey/register/verify', body))).status).toBe(400);
    // another user cannot consume this user's challenge
    const o2 = await (await regOptions(req('/api/auth/passkey/register/options', { password: 'secret' }))).json();
    h.session = 'u2';
    expect((await regVerify(req('/api/auth/passkey/register/verify', { challengeId: o2.challengeId, response: { id: 'z' } }))).status).toBe(400);
  });

  it('list returns only own passkeys and never key material', async () => {
    seedCred(); seedCred({ id: 'pk2', userId: 'u2', credentialId: 'c2' });
    h.session = 'u1';
    const j = await (await listKeys(req('/api/auth/passkey', null, 'GET') as any)).json();
    expect(j.passkeys).toHaveLength(1);
    expect(JSON.stringify(j)).not.toMatch(/publicKey|credentialId|counter/);
  });

  it('delete: other user gets 404 and nothing changes; owner deletes and is ledgered', async () => {
    seedCred();
    h.session = 'u2';
    const ctx = { params: Promise.resolve({ id: 'pk1' }) };
    expect((await delKey(delReq({ password: 'secret' }), ctx)).status).toBe(404);
    expect(h.creds).toHaveLength(1);
    h.session = 'u1';
    expect((await delKey(delReq({ password: 'secret' }), ctx)).status).toBe(200);
    expect(h.creds).toHaveLength(0);
    expect(h.ledger.some((l) => l.action === 'passkey_removed')).toBe(true);
  });

  it('validation: unknown fields rejected', async () => {
    expect((await loginOptions(req('/api/auth/passkey/login/options', { remember: true, extra: 1 }))).status).toBe(400);
  });
});

describe('remember me lifetimes (controlled clock)', () => {
  const T0 = Date.UTC(2026, 0, 1);
  const s = (ms: number) => Math.floor(ms / 1000);
  it('not remembered: valid just before 12h, signed out at 12h', () => {
    const t = applyLifetime({ iat: s(T0) }, { remember: false }, T0)!;
    expect(t.remember).toBe(false);
    expect(applyLifetime(t, null, T0 + SESSION_TTL_SHORT_SECONDS * 1000 - 1000)).not.toBeNull();
    expect(applyLifetime(t, null, T0 + SESSION_TTL_SHORT_SECONDS * 1000)).toBeNull();
  });
  it('remembered: survives 29 days, signed out at 30 days', () => {
    const t = applyLifetime({}, { remember: true }, T0)!;
    expect(applyLifetime(t, null, T0 + 29 * 86400_000)).not.toBeNull();
    expect(applyLifetime(t, null, T0 + SESSION_TTL_REMEMBER_SECONDS * 1000)).toBeNull();
  });
  it('absolute, not sliding: refreshing does not extend authAt', () => {
    const t = applyLifetime({}, { remember: false }, T0)!;
    const later = applyLifetime(t, null, T0 + 11 * 3600_000)!;
    expect(later.authAt).toBe(t.authAt);
    expect(applyLifetime(later, null, T0 + 13 * 3600_000)).toBeNull();
  });
  it('legacy token without authAt uses iat as non-remembered; no timestamps at all fails closed', () => {
    expect(applyLifetime({ iat: s(T0) }, null, T0 + 3600_000)).not.toBeNull();
    expect(applyLifetime({ iat: s(T0) }, null, T0 + 13 * 3600_000)).toBeNull();
    expect(applyLifetime({}, null, T0)).toBeNull();
  });
});

describe('re-authentication, session version, cleanup, caps', () => {
  const regBody = (extra: any = {}) => req('/api/auth/passkey/register/options', extra);

  it('adding a passkey requires a password or ticket; wrong password is 403 with a security event', async () => {
    h.session = 'u1';
    expect((await regOptions(regBody({}))).status).toBe(400);
    expect((await regOptions(regBody({ password: 'a', ticket: 'b' }))).status).toBe(400);
    expect((await regOptions(regBody({ password: 'wrong' }))).status).toBe(403);
    expect(h.ledger.some((l) => l.action === 'SECURITY_EVENT:passkey_reauth_failed')).toBe(true);
    expect((await regOptions(regBody({ password: 'secret' }))).status).toBe(200);
  });

  it('password re-auth is rate limited', async () => {
    h.session = 'u1';
    let last = 0;
    for (let i = 0; i < 7; i++) last = (await regOptions(regBody({ password: 'wrong' }))).status;
    expect(last).toBe(429);
  });

  it('delete without re-auth is 400 and nothing is deleted; wrong password is 403', async () => {
    seedCred(); h.session = 'u1';
    const ctx = { params: Promise.resolve({ id: 'pk1' }) };
    expect((await delKey(delReq({}), ctx)).status).toBe(400);
    expect((await delKey(delReq({ password: 'nope' }), ctx)).status).toBe(403);
    expect(h.creds).toHaveLength(1);
  });

  it('passkey re-auth ticket: single use, bound to the user, 5 minute life', async () => {
    const t = await mintReauthTicket('u1', 1_000);
    expect(await redeemReauthTicket(t, 'u2', 1_001)).toBe(false);
    expect(await redeemReauthTicket(t, 'u1', 1_001)).toBe(true);
    expect(await redeemReauthTicket(t, 'u1', 1_002)).toBe(false);
    const t2 = await mintReauthTicket('u1', 1_000);
    expect(await redeemReauthTicket(t2, 'u1', 1_000 + 5 * 60_000 + 1)).toBe(false);
    // a login ticket is not a re-auth ticket
    expect(await redeemReauthTicket(await mintLoginTicket('u1', false), 'u1')).toBe(false);
  });

  it('full re-auth by passkey ticket works for adding a passkey', async () => {
    seedCred(); h.session = 'u1'; authOk(6);
    const o = await (await loginOptions(req('/api/auth/passkey/login/options', { reauth: true }))).json();
    const v = await loginVerify(assertion(o.challengeId));
    expect(v.status).toBe(200);
    const { ticket, expiresInSeconds } = await v.json();
    expect(expiresInSeconds).toBe(300);
    expect(h.ledger.some((l) => l.action === 'passkey_login')).toBe(false);
    expect((await regOptions(regBody({ ticket }))).status).toBe(200);
    expect((await regOptions(regBody({ ticket }))).status).toBe(403); // single use
  });

  it('reauth challenges need a session and cannot be verified by another user', async () => {
    expect((await loginOptions(req('/api/auth/passkey/login/options', { reauth: true }))).status).toBe(401);
    seedCred(); h.session = 'u2'; authOk(6);
    const o = await (await loginOptions(req('/api/auth/passkey/login/options', { reauth: true }))).json();
    expect((await loginVerify(assertion(o.challengeId))).status).toBe(401); // cred1 belongs to u1
  });

  it('adding and removing a passkey bump the session version, write owner-visible events and return a re-login ticket', async () => {
    h.session = 'u1';
    h.verifyReg.mockResolvedValue({
      verified: true,
      registrationInfo: { userVerified: true, credentialBackedUp: false, credential: { id: 'nc', publicKey: new Uint8Array([1]), counter: 0, transports: [] } },
    });
    const o = await (await regOptions(regBody({ password: 'secret' }))).json();
    const res = await regVerify(req('/api/auth/passkey/register/verify', { challengeId: o.challengeId, response: { id: 'nc' } }));
    const j = await res.json();
    expect(h.sv.u1).toBe(1);
    expect(h.ledger.some((l) => l.action === 'SECURITY_EVENT:credential_added')).toBe(true);
    expect(await redeemLoginTicket(j.ticket)).toEqual({ userId: 'u1', remember: false });
    const id = h.creds[0].id;
    const del = await delKey(delReq({ password: 'secret' }), { params: Promise.resolve({ id }) });
    expect(del.status).toBe(200);
    expect(h.sv.u1).toBe(2);
    expect(h.ledger.some((l) => l.action === 'SECURITY_EVENT:credential_removed')).toBe(true);
  });

  it('jwt callback: stale sessionVersion signs the user out', async () => {
    const { getSessionVersion, bumpSessionVersion, clearSessionVersionCache } = await import('@/lib/auth/session-version');
    clearSessionVersionCache();
    expect(await getSessionVersion('u9')).toBe(0);
    await bumpSessionVersion('u9');
    expect(await getSessionVersion('u9')).toBe(1);
  });

  it('cleanup removes expired and used rows only; open challenges are capped', async () => {
    await issueChallenge('login', 'a', { now: 1_000, clientKey: 'a:1' });
    await issueChallenge('login', 'b', { now: Date.now(), clientKey: 'a:1' });
    const used = await issueChallenge('login', 'c', { now: Date.now(), clientKey: 'a:1' });
    await consumeChallenge(used, 'login');
    expect(await cleanupPasskeyChallenges()).toBe(2);
    expect(h.challenges).toHaveLength(1);
    for (let i = 0; i < MAX_OPEN_CHALLENGES; i++) await issueChallenge('login', 'x', { clientKey: 'a:2' });
    expect(await tooManyOpenChallenges('a:2', 'login')).toBe(true);
    expect(await tooManyOpenChallenges('a:3', 'login')).toBe(false);
    const r = await loginOptions(req('/api/auth/passkey/login/options', {}));
    expect(r.status).toBe(200); // different bucket (route) is unaffected
  });
});

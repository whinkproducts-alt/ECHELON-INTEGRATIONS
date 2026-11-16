/** Lane C1: config-only providers, price gate, Local-Only, failover, Qwen OAuth. Mocked HTTP and DB. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, { encryptedKey: string; keyHint: string }>();
const ledger = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { userApiKey: {
  findUnique: vi.fn(async ({ where }: any) => store.get(where.userId_provider.userId + where.userId_provider.provider) ?? null),
  findMany: vi.fn(async () => []),
  upsert: vi.fn(async ({ where, create, update }: any) => { const k = where.userId_provider.userId + where.userId_provider.provider; store.set(k, { ...(store.get(k) ?? create), ...update }); }),
} } }));
vi.mock('@/lib/ledger', () => ({ recordActionSafe: (e: unknown) => ledger(e) }));
vi.mock('@/lib/model-router/dispatch', () => ({ admittedCall: async (_s: unknown, run: () => Promise<unknown>) => run() }));

import { PROVIDERS, priceKnown } from '@/lib/model-router/provider-catalog';
import { providerChatOnce, providerScope, ProviderRefusedError } from '@/lib/model-router/providers';
import { entryConfigured, modelRegistry } from '@/lib/model-router/registry';
import { decideAdmission } from '@/lib/model-router/admission';
import { chatWithFailover } from '@/lib/model-router/failover';
import { __resetModelHealth, healthOf, planRoute } from '@/lib/model-router/priority';
import { getQwenAccessToken, importQwenLogin } from '@/lib/model-router/qwen-oauth';

const PRICES = JSON.stringify(Object.fromEntries(PROVIDERS.map((p) => [`${p.id}/`, { in: 1, out: 2 }])));
const ENV = { WHINK_MODEL_PRICES: PRICES, OPENROUTER_API_KEY: 'sk-or-SECRET', RAMP_API_KEY: 'k' };
const ok = (content = 'hi') => vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));

beforeEach(() => { store.clear(); ledger.mockClear(); __resetModelHealth(); process.env.ENCRYPTION_KEY = 'ab'.repeat(32); });

describe('catalogue and registry', () => {
  it('lists every requested provider, metered, never local, never private data', () => {
    const r = modelRegistry({});
    for (const p of PROVIDERS) {
      const e = r.find((x) => x.id === p.id)!;
      expect(e).toMatchObject({ cost: 'metered', local: false, dataCeiling: 'internal' });
    }
    expect(PROVIDERS.length).toBe(18);
  });
  it('is configured only with a key and a base URL (Ramp has no default URL)', () => {
    const get = (id: string, env: Record<string, string>) => entryConfigured(modelRegistry(env).find((e) => e.id === id)!, env);
    expect(get('openrouter', {})).toBe(false);
    expect(get('openrouter', ENV)).toBe(true);
    expect(get('ramp', ENV)).toBe(false);
    expect(get('ramp', { ...ENV, RAMP_BASE_URL: 'https://r.example/v1' })).toBe(true);
  });
  it('is skipped under Local-Only and lockdown, and for private data', () => {
    const base = { dataClass: 'internal' as const, needsTools: false, paidAdmitted: () => true, env: ENV };
    expect(planRoute(['openrouter'], { ...base, lockedDown: false, localOnly: true }).skipped[0].reason).toBe('local_only');
    expect(planRoute(['openrouter'], { ...base, lockedDown: true, localOnly: false }).skipped[0].reason).toBe('lockdown');
    expect(planRoute(['openrouter'], { ...base, dataClass: 'private', lockedDown: false, localOnly: false }).skipped[0].reason).toBe('data_class');
  });
});

describe('price and spend gates', () => {
  it('no price entry means unknown price, refused by admission', () => {
    expect(priceKnown('openrouter', 'm', {})).toBe(false);
    const s = providerScope(PROVIDERS[0], 'm', 'u', 100, 50, {});
    expect(s.priceKnown).toBe(false);
    const d = (priceKnownV: boolean, paid: boolean, cap: number | null) => decideAdmission({
      userId: 'u', costClass: 'metered', priceKnown: priceKnownV, paidAdmitted: paid, spendCapMicros: cap, reservedTokens: 10, reservedMicros: 1,
      tokenUsed: 0, tokenReserved: 0, tokenLimit: null, tokenHardPct: 100, spendUsedMicros: 0, spendReservedMicros: 0, lockedDown: false, localOnly: false });
    expect(d(false, true, 100)).toEqual({ ok: false, code: 'UNKNOWN_PRICE' });
    expect(d(true, false, 100)).toEqual({ ok: false, code: 'PAID_NOT_ADMITTED' }); // envelope off
    expect(d(true, true, null)).toEqual({ ok: false, code: 'SPEND_CAP_UNSET' });
    expect(d(true, true, 100).ok).toBe(true);
  });
  it('priced model reserves metered micros', () => {
    const env = { WHINK_MODEL_PRICES: JSON.stringify({ 'openrouter/m': { in: 3, out: 6 } }) };
    expect(providerScope(PROVIDERS[0], 'm', 'u', 400, 100, env)).toMatchObject({ costClass: 'metered', priceKnown: true, reservedMicros: 600 });
  });
});

describe('providerChatOnce', () => {
  const base = { userId: 'u', providerId: 'openrouter', model: 'm', messages: [{ role: 'user', content: 'x' }] };
  const env = { ...ENV, WHINK_MODEL_PRICES: JSON.stringify({ 'openrouter/m': { in: 1, out: 1 } }) };
  it('calls the provider with the env key', async () => {
    const f = ok('answer');
    expect(await providerChatOnce({ ...base, env, fetchImpl: f as any })).toBe('answer');
    expect((f.mock.calls[0] as any)[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((f.mock.calls[0] as any)[1].headers.Authorization).toBe('Bearer sk-or-SECRET');
  });
  it('refuses with no network call: Local-Only, unknown price, no key', async () => {
    const f = ok();
    const code = async (e: Record<string, string>) => providerChatOnce({ ...base, env: e, fetchImpl: f as any }).catch((x) => (x as ProviderRefusedError).code);
    expect(await code({ ...env, WHINK_LOCAL_ONLY: 'true' })).toBe('LOCAL_ONLY');
    expect(await code({ ...env, WHINK_MODEL_PRICES: '{}' })).toBe('UNKNOWN_PRICE');
    expect(await code({ WHINK_MODEL_PRICES: env.WHINK_MODEL_PRICES })).toBe('NO_KEY');
    expect(f).not.toHaveBeenCalled();
  });
  it('error text never carries the response body', async () => {
    const f = vi.fn(async () => new Response('echo sk-or-SECRET', { status: 500 }));
    await expect(providerChatOnce({ ...base, env, fetchImpl: f as any })).rejects.toThrow(/^openrouter error 500$/);
  });
});

describe('failover (item 31)', () => {
  it('kills the primary, the next model answers, the switch is ledgered', async () => {
    const calls: string[] = [];
    const r = await chatWithFailover(
      { userId: 'u', correlationId: 'c1', candidates: [{ id: 'openrouter', model: 'a' }, { id: 'local-default', model: 'b' }] },
      async (c) => { calls.push(c.id); if (c.id === 'openrouter') throw new Error('connection reset 502'); return 'from local'; },
    );
    expect(r).toMatchObject({ ok: true, used: 'local-default', text: 'from local' });
    expect(calls).toEqual(['openrouter', 'local-default']);
    expect(ledger).toHaveBeenCalledWith(expect.objectContaining({ action: 'model_failover', correlationId: 'c1', inputSummary: expect.stringContaining('from=openrouter to=local-default') }));
  });
  it('a credential failure benches the primary', async () => {
    await chatWithFailover({ userId: 'u', correlationId: 'c', candidates: [{ id: 'fireworks', model: 'a' }, { id: 'local-default', model: 'b' }] },
      async (c) => { if (c.id === 'fireworks') throw new Error('error 401'); return 'ok'; });
    expect(healthOf('fireworks')).toBe('credential_rejected');
  });
  it('an account-wide spend stop does not fail over', async () => {
    const e = Object.assign(new Error('SPEND_HARD_LIMIT'), { name: 'DispatchBlockedError', code: 'SPEND_HARD_LIMIT' });
    const next = vi.fn(async () => 'x');
    const r = await chatWithFailover({ userId: 'u', correlationId: 'c', candidates: [{ id: 'a', model: 'a' }, { id: 'b', model: 'b' }] }, async (c) => { if (c.id === 'a') throw e; return next(); });
    expect(r).toMatchObject({ ok: false, reason: 'stopped' });
    expect(next).not.toHaveBeenCalled();
  });
  it('reports all_failed', async () => {
    const r = await chatWithFailover({ userId: 'u', correlationId: 'c', candidates: [{ id: 'a', model: 'a' }] }, async () => { throw new Error('boom'); });
    expect(r).toMatchObject({ ok: false, reason: 'all_failed' });
  });
});

describe('Qwen OAuth', () => {
  const login = { access_token: 'secret-access-AT', refresh_token: 'secret-refresh-RT', expiry_date: Date.now() + 3_600_000 };
  it('rejects a malformed login and stores a valid one encrypted', async () => {
    expect((await importQwenLogin('u', '{"access_token":"x"}')).ok).toBe(false);
    expect((await importQwenLogin('u', JSON.stringify(login))).ok).toBe(true);
    const raw = JSON.stringify([...store.values()]);
    expect(raw).not.toContain('secret-access'); expect(raw).not.toContain('secret-refresh');
    expect(JSON.stringify(ledger.mock.calls)).not.toContain('secret-');
  });
  it('returns a fresh token without a network call', async () => {
    await importQwenLogin('u', login);
    const f = vi.fn();
    expect(await getQwenAccessToken('u', { fetchImpl: f as any })).toBe('secret-access-AT');
    expect(f).not.toHaveBeenCalled();
  });
  it('refreshes an expired token, saves it, and refuses without operator config', async () => {
    await importQwenLogin('u', { ...login, expiry_date: Date.now() - 1000 });
    expect(await getQwenAccessToken('u', { env: {} })).toBeNull();
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: 'AT2', expires_in: 3600 }), { status: 200 }));
    const env = { QWEN_OAUTH_TOKEN_URL: 'https://idp.example/token', QWEN_OAUTH_CLIENT_ID: 'cid' };
    expect(await getQwenAccessToken('u', { env, fetchImpl: f as any })).toBe('AT2');
    expect(await getQwenAccessToken('u', { fetchImpl: f as any })).toBe('AT2'); // saved, no second call
    expect(f).toHaveBeenCalledTimes(1);
    expect(await getQwenAccessToken('nobody')).toBeNull();
  });
});

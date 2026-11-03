import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db, resetDb } from './helpers/mock-db';

vi.mock('@/lib/db', () => ({ prisma: db }));
const recordActionSafe = vi.fn().mockResolvedValue({ id: 'l1' });
vi.mock('@/lib/ledger', () => ({ recordActionSafe: (e: unknown) => recordActionSafe(e), recordAction: vi.fn() }));

import { recordUsage, estimateCostMicros, usageSummary } from '../usage';
import { budgetState, decideBudget, effectiveLimit, setBudget, BudgetInputSchema, monthWindow } from '../budget';
import { isCloudModel, isLocalUrl } from '../model-router';
import { applyOfflineFallback, connectivityMode, routeHint, __setProbeFetch, ollamaReachable } from '../offline';

const ENV = { ...process.env };
beforeEach(() => { resetDb(); recordActionSafe.mockClear(); __setProbeFetch(null); });
afterEach(() => { process.env = { ...ENV }; });

describe('usage recording', () => {
  it('is fire-and-forget: returns synchronously even if the insert never resolves', () => {
    db.usageEvent.create.mockReturnValue(new Promise(() => {}));
    const t = Date.now();
    expect(recordUsage({ userId: 'uA', provider: 'anthropic', model: 'claude-x', tokensIn: 10, tokensOut: 5 })).toBeUndefined();
    expect(Date.now() - t).toBeLessThan(50);
    expect(db.usageEvent.create.mock.calls[0][0].data).toMatchObject({ userId: 'uA', tokensIn: 10, tokensOut: 5 });
  });
  it('swallows insert failures', async () => {
    db.usageEvent.create.mockRejectedValue(new Error('down'));
    expect(() => recordUsage({ userId: 'uA', provider: 'p', model: 'm', tokensIn: 1, tokensOut: 1 })).not.toThrow();
    await new Promise((r) => setTimeout(r, 5));
  });
  it('ignores empty usage and missing user', () => {
    recordUsage({ userId: 'uA', provider: 'p', model: 'm', tokensIn: 0, tokensOut: 0 });
    recordUsage({ userId: '', provider: 'p', model: 'm', tokensIn: 5, tokensOut: 5 });
    expect(db.usageEvent.create).not.toHaveBeenCalled();
  });
  it('cost is unknown without configured prices, never a guess', () => {
    expect(estimateCostMicros('claude-x', 1000, 1000, '')).toBeNull();
    expect(estimateCostMicros('claude-x', 1000, 2000, JSON.stringify({ claude: { in: 3, out: 15 } }))).toBe(33000);
    expect(estimateCostMicros('claude-x', 1, 1, 'not json')).toBeNull();
    expect(estimateCostMicros('local', 1, 1, '{"local":{"in":0,"out":0}}')).toBe(0);
  });
  it('summary is scoped by userId and aggregates per day and model', async () => {
    db.usageEvent.findMany.mockResolvedValue([
      { provider: 'a', model: 'm1', tokensIn: 10, tokensOut: 5, costMicros: 1, createdAt: new Date('2026-10-25T01:00:00Z') },
      { provider: 'a', model: 'm1', tokensIn: 1, tokensOut: 1, costMicros: null, createdAt: new Date('2026-10-25T02:00:00Z') },
    ]);
    const s = await usageSummary('uA', '7d', new Date('2026-10-25T12:00:00Z'));
    expect(db.usageEvent.findMany.mock.calls[0][0].where.userId).toBe('uA');
    expect(s.daily).toHaveLength(7);
    expect(s.daily.at(-1)).toMatchObject({ day: '2026-10-25', tokensIn: 11, tokensOut: 6 });
    expect(s.byModel[0]).toMatchObject({ model: 'm1', calls: 2, unknownCostCalls: 1, costMicros: 1 });
  });
});

describe('budget', () => {
  it('thresholds: ok, soft at 80%, hard at 100%; unlimited is always ok', () => {
    expect(decideBudget(79, 100, 80, 100)).toBe('ok');
    expect(decideBudget(80, 100, 80, 100)).toBe('soft');
    expect(decideBudget(100, 100, 80, 100)).toBe('hard');
    expect(decideBudget(10 ** 9, null, 80, 100)).toBe('ok');
  });
  it('budgetState reads this user only and uses the UTC month', async () => {
    db.userPreference.findUnique.mockResolvedValue({ monthlyTokenBudget: 1000, budgetSoftPct: null, budgetHardPct: null });
    db.usageEvent.aggregate.mockResolvedValue({ _sum: { tokensIn: 500, tokensOut: 400 } });
    const b = await budgetState('uA', new Date('2026-10-25T00:00:00Z'));
    expect(b).toMatchObject({ state: 'soft', used: 900, limit: 1000, softPct: 80, hardPct: 100, resetsAt: '2026-11-01T00:00:00.000Z' });
    expect(db.usageEvent.aggregate.mock.calls[0][0].where.userId).toBe('uA');
    expect(db.userPreference.findUnique.mock.calls[0][0].where).toEqual({ userId: 'uA' });
    expect(monthWindow(new Date('2026-12-31T23:59:59Z')).resetsAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
  it('env default applies when the user has no preference', async () => {
    process.env.WHINK_MONTHLY_TOKEN_BUDGET = '100';
    db.userPreference.findUnique.mockResolvedValue(null);
    db.usageEvent.aggregate.mockResolvedValue({ _sum: { tokensIn: 100, tokensOut: null } });
    expect((await budgetState('uA')).state).toBe('hard');
  });
  it('setBudget goes through the permission engine (Class A) and ledgers', async () => {
    db.userPreference.upsert.mockResolvedValue({});
    db.userPreference.findUnique.mockResolvedValue({ monthlyTokenBudget: 5000, budgetSoftPct: null, budgetHardPct: null });
    db.usageEvent.aggregate.mockResolvedValue({ _sum: { tokensIn: 0, tokensOut: 0 } });
    const r = await setBudget('uA', BudgetInputSchema.parse({ monthlyTokenBudget: 5000 }));
    expect(r.ok).toBe(true);
    expect(db.userPreference.upsert.mock.calls[0][0].where).toEqual({ userId: 'uA' });
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ action: 'usage_budget_updated', userId: 'uA', permissionClass: 'A' }));
  });
  it('rejects soft above hard and negative budgets', () => {
    expect(BudgetInputSchema.safeParse({ monthlyTokenBudget: 10, softPct: 90, hardPct: 80 }).success).toBe(false);
    expect(BudgetInputSchema.safeParse({ monthlyTokenBudget: -1 }).success).toBe(false);
  });
});

describe('operator cap cannot be removed by a user', () => {
  it('effectiveLimit', () => {
    expect(effectiveLimit(0, 1000)).toBe(1000);
    expect(effectiveLimit(null, 1000)).toBe(1000);
    expect(effectiveLimit(5000, 1000)).toBe(1000);
    expect(effectiveLimit(300, 1000)).toBe(300);
    expect(effectiveLimit(0, 0)).toBeNull();
    expect(effectiveLimit(null, 0)).toBeNull();
    expect(effectiveLimit(77, 0)).toBe(77);
  });
  it('budgetState: user sets 0 or a huge value while the env cap is set -> still capped (BigInt column handled)', async () => {
    process.env.WHINK_MONTHLY_TOKEN_BUDGET = '1000';
    db.usageEvent.aggregate.mockResolvedValue({ _sum: { tokensIn: 1000, tokensOut: 0 } });
    db.userPreference.findUnique.mockResolvedValue({ monthlyTokenBudget: BigInt(0), budgetSoftPct: null, budgetHardPct: null });
    expect(await budgetState('uA')).toMatchObject({ limit: 1000, state: 'hard' });
    db.userPreference.findUnique.mockResolvedValue({ monthlyTokenBudget: BigInt(9_000_000_000), budgetSoftPct: null, budgetHardPct: null });
    expect((await budgetState('uA')).limit).toBe(1000);
  });
});

describe('threshold ceiling', () => {
  it('a user hardPct above the tenant ceiling is clamped', async () => {
    db.userPreference.findUnique.mockResolvedValue({ monthlyTokenBudget: BigInt(1000), budgetSoftPct: null, budgetHardPct: 200 });
    db.usageEvent.aggregate.mockResolvedValue({ _sum: { tokensIn: 1000, tokensOut: 0 } });
    expect(await budgetState('uA')).toMatchObject({ hardPct: 100, state: 'hard' });
  });
});

describe('offline routing', () => {
  it('routeHint prefers local when offline or over the hard limit, and says why', () => {
    expect(routeHint({ state: 'ok' }, 'online')).toEqual({ useLocal: false, reason: null });
    expect(routeHint({ state: 'soft' }, 'degraded')).toEqual({ useLocal: false, reason: null });
    expect(routeHint({ state: 'ok' }, 'offline')).toEqual({ useLocal: true, reason: 'offline' });
    expect(routeHint({ state: 'hard' }, 'online')).toEqual({ useLocal: true, reason: 'budget_hard' });
  });
  it('connectivityMode probes the configured host, caches for 10 s, and maps results', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'; delete process.env.GEMINI_API_KEY;
    process.env.ANTHROPIC_BASE_URL = 'https://llm.internal.test';
    const f = vi.fn().mockResolvedValue({ status: 401 });
    __setProbeFetch(f);
    expect(await connectivityMode(1000)).toBe('online');
    expect(f.mock.calls[0][0]).toBe('https://llm.internal.test');
    await connectivityMode(5000);
    expect(f).toHaveBeenCalledTimes(1);
    f.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await connectivityMode(12000)).toBe('offline');
  });
  it('no cloud provider configured is online without probing', async () => {
    delete process.env.ANTHROPIC_API_KEY; delete process.env.GEMINI_API_KEY;
    const f = vi.fn(); __setProbeFetch(f);
    expect(await connectivityMode()).toBe('online');
    expect(f).not.toHaveBeenCalled();
  });
  it('flag off (default): model unchanged and nothing probed', async () => {
    delete process.env.WHINK_OFFLINE_FALLBACK;
    const f = vi.fn(); __setProbeFetch(f);
    const r = await applyOfflineFallback({ userId: 'uA', model: 'claude-x', apiKey: 'byok' });
    expect(r).toEqual({ model: 'claude-x', apiKey: 'byok', fellBack: false, reason: null });
    expect(f).not.toHaveBeenCalled();
    expect(recordActionSafe).not.toHaveBeenCalled();
  });
  it('flag on + offline + ollama up: switches to local, drops the cloud key, ledgers the reason', async () => {
    process.env.WHINK_OFFLINE_FALLBACK = 'true'; process.env.ANTHROPIC_API_KEY = 'k'; delete process.env.GEMINI_API_KEY;
    process.env.ANTHROPIC_BASE_URL = 'https://cloud.test'; process.env.OLLAMA_URL = 'http://127.0.0.1:11434';
    process.env.WHINK_LOCAL_MODEL = 'qwen2.5:7b';
    db.userPreference.findUnique.mockResolvedValue(null);
    db.usageEvent.aggregate.mockResolvedValue({ _sum: {} });
    __setProbeFetch(async (url) => { if (new URL(url).hostname === 'cloud.test') throw new Error('offline'); return { status: 200 }; });
    const r = await applyOfflineFallback({ userId: 'uA', model: 'claude-x', apiKey: 'byok', correlationId: 'c1' });
    expect(r).toEqual({ model: 'qwen2.5:7b', apiKey: undefined, baseUrl: 'http://127.0.0.1:11434/v1', fellBack: true, reason: 'offline' });
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ userId: 'uA', action: 'model_fallback_local', correlationId: 'c1' }));
    expect(recordActionSafe.mock.calls[0][0].inputSummary).toContain('reason=offline');
  });
  it('hard budget on a reachable cloud also falls back; local down means no change', async () => {
    process.env.WHINK_OFFLINE_FALLBACK = 'true'; process.env.ANTHROPIC_API_KEY = 'k'; delete process.env.GEMINI_API_KEY;
    db.userPreference.findUnique.mockResolvedValue({ monthlyTokenBudget: 10, budgetSoftPct: null, budgetHardPct: null });
    db.usageEvent.aggregate.mockResolvedValue({ _sum: { tokensIn: 10, tokensOut: 5 } });
    __setProbeFetch(async () => ({ status: 200 }));
    expect((await applyOfflineFallback({ userId: 'uA', model: 'claude-x' })).reason).toBe('budget_hard');
    recordActionSafe.mockClear();
    __setProbeFetch(async (url) => { if (url.includes('/api/tags')) throw new Error('down'); return { status: 200 }; });
    const r = await applyOfflineFallback({ userId: 'uA', model: 'claude-x' });
    expect(r.fellBack).toBe(false);
    expect(recordActionSafe).not.toHaveBeenCalled();
    expect(await ollamaReachable(Date.now() + 60_000)).toBe(false);
  });
  it('isLocalUrl and isCloudModel: an OpenAI-style model on a remote base URL is cloud, on a local one is local', () => {
    expect(isLocalUrl('http://localhost:11434/v1')).toBe(true);
    expect(isLocalUrl('http://192.168.1.20:11434')).toBe(true);
    expect(isLocalUrl('https://api.openai.com/v1')).toBe(false);
    expect(isLocalUrl('http://172.32.0.1')).toBe(false);
    process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://api.cloudllm.example/v1';
    expect(isCloudModel('gpt-4o')).toBe(true);
    process.env.OPENAI_COMPATIBLE_BASE_URL = 'http://localhost:11434/v1';
    expect(isCloudModel('llama3.1:8b')).toBe(false);
    expect(isCloudModel('claude-x')).toBe(true);
  });
  it('fallback returns an explicit OLLAMA_URL-based baseUrl and refuses a remote OLLAMA_URL', async () => {
    process.env.WHINK_OFFLINE_FALLBACK = 'true'; process.env.ANTHROPIC_API_KEY = 'k'; delete process.env.GEMINI_API_KEY;
    process.env.ANTHROPIC_BASE_URL = 'https://cloud.test'; process.env.OLLAMA_URL = 'http://127.0.0.1:11434';
    db.userPreference.findUnique.mockResolvedValue(null);
    db.usageEvent.aggregate.mockResolvedValue({ _sum: {} });
    __setProbeFetch(async (url) => { if (new URL(url).hostname === 'cloud.test') throw new Error('offline'); return { status: 200 }; });
    expect((await applyOfflineFallback({ userId: 'uA', model: 'claude-x' })).baseUrl).toBe('http://127.0.0.1:11434/v1');
    process.env.OLLAMA_URL = 'https://ollama.attacker.example';
    __setProbeFetch(async (url) => { if (new URL(url).hostname === 'cloud.test') throw new Error('offline'); return { status: 200 }; });
    const r = await applyOfflineFallback({ userId: 'uA', model: 'claude-x', apiKey: 'byok' });
    expect(r).toMatchObject({ fellBack: false, model: 'claude-x' });
  });
  it('local models are never rerouted', async () => {
    process.env.WHINK_OFFLINE_FALLBACK = 'true';
    expect((await applyOfflineFallback({ userId: 'uA', model: 'llama3.1:8b' })).fellBack).toBe(false);
  });
});

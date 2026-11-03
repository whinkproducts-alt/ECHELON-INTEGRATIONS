/** R04: registry, choice validation, per-request eligibility and bounded fallback. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/ledger', () => ({ recordActionSafe: vi.fn() }));
import { publicRegistry, modelRegistry } from '@/lib/model-router/registry';
import { __resetModelHealth, classifyFailure, healthOf, markFailure, paidAdmission, planRoute, runWithFallback, validateChoices, type RouteContext } from '@/lib/model-router/priority';

const ENV = { ANTHROPIC_API_KEY: 'present', NVIDIA_API_KEY: 'present', DEFAULT_MODEL: 'wink-qwen3.5-9b-8k' };
const ctx = (over: Partial<RouteContext> = {}): RouteContext => ({
  lockedDown: false, localOnly: false, dataClass: 'private', needsTools: false, paidAdmitted: () => true, env: ENV, ...over,
});
const ids = (p: ReturnType<typeof planRoute>) => p.steps.map((s) => `${s.type}:${s.entry.id}`);

beforeEach(() => __resetModelHealth());

describe('registry', () => {
  it('lists local, paid, NVIDIA trial and DeepSeek browser options', () => {
    const r = modelRegistry(ENV).map((e) => e.id);
    expect(r).toEqual(expect.arrayContaining(['local-default', 'anthropic-sonnet', 'nvidia-nemotron-3-ultra', 'nvidia-deepseek', 'deepseek-browser']));
  });
  it('NVIDIA trial entries are evaluation only and capped to synthetic data', () => {
    for (const e of modelRegistry(ENV).filter((x) => x.provider === 'nvidia')) {
      expect(e.admitted).toBe(false);
      expect(e.dataCeiling).toBe('synthetic');
    }
  });
  it('the public view reports credential presence, never a value', () => {
    const json = JSON.stringify(publicRegistry({ ...ENV, ANTHROPIC_API_KEY: 'sk-ant-SECRET' }));
    expect(json).not.toContain('SECRET');
    expect(publicRegistry({}).find((e) => e.id === 'anthropic-sonnet')?.configured).toBe(false);
  });
});

describe('choices', () => {
  it('accepts 1 to 3 distinct known ids', () => {
    expect(validateChoices(['local-default'], ENV)).toEqual({ ok: true, choices: ['local-default'] });
    expect(validateChoices(['anthropic-sonnet', 'local-default', 'deepseek-browser'], ENV).ok).toBe(true);
  });
  it.each([
    [[], 'empty'], [['a', 'b', 'c', 'd'], 'too many'], [['local-default', 'local-default'], 'duplicate'],
    [['not-a-model'], 'unknown'], [[42], 'not a string'], ['local-default', 'not an array'],
  ] as Array<[unknown, string]>)('rejects %j (%s)', (raw) => {
    expect(validateChoices(raw, ENV).ok).toBe(false);
  });
});

describe('planning', () => {
  it('keeps the Founder order when everything is eligible', () => {
    expect(ids(planRoute(['anthropic-sonnet', 'local-default'], ctx()))).toEqual(['auto:anthropic-sonnet', 'auto:local-default']);
  });
  it('lockdown and Local-Only leave only local models', () => {
    for (const c of [ctx({ lockedDown: true }), ctx({ localOnly: true })]) {
      const p = planRoute(['anthropic-sonnet', 'deepseek-browser', 'local-default'], c);
      expect(ids(p)).toEqual(['auto:local-default']);
      expect(p.skipped.map((s) => s.id)).toEqual(['anthropic-sonnet', 'deepseek-browser']);
    }
  });
  it('private data never reaches a trial provider', () => {
    const p = planRoute(['nvidia-nemotron-3-ultra', 'local-default'], ctx());
    expect(p.skipped).toEqual([{ id: 'nvidia-nemotron-3-ultra', reason: 'data_class' }]);
  });
  it('trial entries are not admitted even for synthetic data', () => {
    const p = planRoute(['nvidia-deepseek'], ctx({ dataClass: 'synthetic' }));
    expect(p.skipped).toEqual([{ id: 'nvidia-deepseek', reason: 'trial_evaluation_only' }]);
  });
  it('selecting a paid model does not admit spend', () => {
    const p = planRoute(['anthropic-sonnet', 'local-default'], ctx({ paidAdmitted: paidAdmission({}) }));
    expect(p.skipped).toEqual([{ id: 'anthropic-sonnet', reason: 'paid_not_admitted' }]);
    expect(ids(p)).toEqual(['auto:local-default']);
  });
  it('paid admission comes from the operator flag or the user’s own key', () => {
    const e = modelRegistry(ENV).find((x) => x.id === 'anthropic-sonnet')!;
    expect(paidAdmission({ WHINK_PAID_MODELS_ENABLED: 'true' })(e)).toBe(true);
    expect(paidAdmission({}, new Set(['anthropic']))(e)).toBe(true);
    expect(paidAdmission({}, new Set(['openai']))(e)).toBe(false);
  });
  it('a missing credential is skipped as not configured', () => {
    const p = planRoute(['anthropic-sonnet'], ctx({ env: {} }));
    expect(p.skipped).toEqual([{ id: 'anthropic-sonnet', reason: 'not_configured' }]);
  });
  it('a manual handoff stops automatic fallback; later choices are not planned', () => {
    const p = planRoute(['deepseek-browser', 'local-default'], ctx({ dataClass: 'internal' }));
    expect(ids(p)).toEqual(['handoff:deepseek-browser']);
  });
  it('private data is not handed to the browser chat', () => {
    expect(planRoute(['deepseek-browser'], ctx()).skipped).toEqual([{ id: 'deepseek-browser', reason: 'data_class' }]);
  });
  it('a model in cooldown is skipped until it expires', () => {
    markFailure('anthropic-sonnet', 'quota', 1_000);
    expect(planRoute(['anthropic-sonnet'], ctx({ now: 2_000 })).skipped[0].reason).toBe('cooldown');
    expect(planRoute(['anthropic-sonnet'], ctx({ now: 1_000 + 5 * 60_000 + 1 })).steps.length).toBe(1);
  });
});

describe('failure classification', () => {
  it.each([
    [new Error('OpenAI-compatible endpoint error 401: no'), 'credential'],
    [new Error('ANTHROPIC_API_KEY not set'), 'credential'],
    [new Error('endpoint error 429: slow down'), 'quota'],
    [new Error('402 payment required'), 'quota'],
    [Object.assign(new Error('x'), { name: 'AbortError' }), 'timeout'],
    [new Error('socket hang up'), 'other'],
  ])('%s -> %s', (e, kind) => { expect(classifyFailure(e)).toBe(kind); });
  it('a rejected credential disables the entry; other errors do not', () => {
    markFailure('anthropic-haiku', 'credential', 0);
    expect(healthOf('anthropic-haiku', 1)).toBe('credential_rejected');
    markFailure('local-default', 'other', 0);
    expect(healthOf('local-default', 1)).toBeNull();
  });
});

describe('fallback', () => {
  it('moves to the next choice after a transient failure and reports the attempts', async () => {
    const plan = planRoute(['anthropic-sonnet', 'local-default'], ctx());
    const invoke = vi.fn(async (e: { id: string }) => { if (e.id === 'anthropic-sonnet') throw new Error('error 429'); return `ok:${e.id}`; });
    const r = await runWithFallback(plan, invoke);
    expect(r).toMatchObject({ status: 'ok', value: 'ok:local-default', used: { id: 'local-default' } });
    expect(r.attempts).toEqual([{ id: 'anthropic-sonnet', error: 'quota' }, { id: 'local-default' }]);
    expect(healthOf('anthropic-sonnet')).toBe('cooldown');
  });
  it('pauses at a manual handoff without calling anything after it', async () => {
    const plan = planRoute(['deepseek-browser', 'local-default'], ctx({ dataClass: 'internal' }));
    const invoke = vi.fn();
    const r = await runWithFallback(plan, invoke);
    expect(r.status).toBe('handoff');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('no eligible model is a visible blocked result', async () => {
    const r = await runWithFallback({ steps: [], skipped: [] }, vi.fn());
    expect(r).toMatchObject({ status: 'blocked', reason: 'no eligible model' });
  });
  it('stops when the total time budget is used', async () => {
    let t = 0;
    const plan = planRoute(['anthropic-sonnet', 'local-default'], ctx());
    const invoke = vi.fn(async () => { t += 10_000; throw new Error('socket hang up'); });
    const r = await runWithFallback(plan, invoke, { totalBudgetMs: 5_000, now: () => t });
    expect(r.status).toBe('blocked');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from 'vitest';
import { answerDashboard } from '@/app/dev-preview/_components/fixtures-dashboard';
import type { MockCtx } from '@/app/dev-preview/_components/fixtures';
const context = (): MockCtx => ({ screen: 'dashboard', state: 'ready', now: () => 0, counters: { casl: false } });
const url = (path: string) => new URL(path, 'http://fixture.test');
describe('isolated dashboard scenarios', () => {
  it('does not intercept other preview screens', () => {
    expect(answerDashboard('GET', url('/api/worker/status'), null, { ...context(), screen: 'today' })).toBeNull();
  });
  it('keeps a refresh failure distinct from an empty success', () => {
    const ctx = { ...context(), fault: 'stale' };
    expect(answerDashboard('GET', url('/api/projects'), null, ctx)?.status).toBe(200);
    expect(answerDashboard('GET', url('/api/projects'), null, ctx)?.status).toBe(503);
  });
  it('provides denied and loading scenarios independently', () => {
    expect(answerDashboard('GET', url('/api/ledger'), null, { ...context(), fault: 'denied' })?.status).toBe(403);
    expect(answerDashboard('GET', url('/api/worker/status'), null, { ...context(), state: 'loading' })?.delayMs).toBeGreaterThan(0);
  });
  it('enforces the real message request field in its simulated stream', () => {
    expect(answerDashboard('POST', url('/api/conversations/fixture-conversation/messages'), { content: 'wrong field' }, context())?.status).toBe(400);
    expect(answerDashboard('POST', url('/api/conversations/fixture-conversation/messages'), { message: 'correct field' }, context())?.sse).toBe(true);
  });
  it('keeps fixture agent state synchronized', () => {
    const ctx = context();
    answerDashboard('POST', url('/api/persona/switch'), { persona: 'MAMBA' }, ctx);
    expect(answerDashboard('GET', url('/api/persona/state'), null, ctx)?.body).toMatchObject({ activePersona: 'MAMBA', mambaMode: 'OBSIDIAN' });
    expect(answerDashboard('POST', url('/api/persona/switch'), { persona: 'AMARA' }, ctx)?.status).toBe(400);
  });
});

describe('canonical conversation failure fixtures', () => {
  it('isolates history and failed sends from real services', () => {
    const base={...context(),screen:'conversation'};
    expect(answerDashboard('GET',url('/api/conversations'),null,base)?.body).toBeInstanceOf(Array);
    expect(answerDashboard('POST',url('/api/conversations'),null,{...base,fault:'create-failed'})?.status).toBe(503);
    expect(answerDashboard('POST',url('/api/conversations/fixture-history/messages'),{message:'fixture'},{...base,fault:'send-denied'})?.status).toBe(403);
    expect(answerDashboard('POST',url('/api/conversations/fixture-history/messages'),{message:'fixture'},{...base,fault:'stream-error'})?.sse).toBe(true);
  });
});

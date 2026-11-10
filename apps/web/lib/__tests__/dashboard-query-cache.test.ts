import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDashboardQueryClient, DASHBOARD_KEYS } from '@/lib/dashboard-query-cache';

afterEach(() => vi.useRealTimers());

describe('account shell display cache', () => {
  it('coalesces simultaneous consumers and serves a repeat visit without another request', async () => {
    vi.useFakeTimers();
    const client = createDashboardQueryClient();
    const load = vi.fn(() => new Promise<string[]>((resolve) => setTimeout(() => resolve(['fixture']), 300)));
    // Previous per-consumer mount pattern: three independent reads, each 300ms.
    const baseline = Promise.all([load(), load(), load()]);
    await vi.advanceTimersByTimeAsync(300); await baseline;
    expect(load).toHaveBeenCalledTimes(3);
    load.mockClear();
    const options = { queryKey: DASHBOARD_KEYS.projects, queryFn: load };
    const coldStart = Date.now();
    const cold = Promise.all([client.fetchQuery(options), client.fetchQuery(options), client.fetchQuery(options)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(await cold).toEqual([['fixture'], ['fixture'], ['fixture']]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(Date.now() - coldStart).toBe(300);
    const warmStart = Date.now();
    expect(await client.fetchQuery(options)).toEqual(['fixture']);
    expect(Date.now() - warmStart).toBe(0);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_001);
    const stale = client.fetchQuery(options);
    await vi.advanceTimersByTimeAsync(300); await stale;
    expect(load).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it('never shares values between account instances and clears all data on disposal', async () => {
    const a = createDashboardQueryClient(); const b = createDashboardQueryClient();
    await a.fetchQuery({ queryKey: DASHBOARD_KEYS.tasks, queryFn: async () => ['account a only'] });
    expect(b.getQueryData(DASHBOARD_KEYS.tasks)).toBeUndefined();
    await b.fetchQuery({ queryKey: DASHBOARD_KEYS.tasks, queryFn: async () => ['account b only'] });
    expect(a.getQueryData(DASHBOARD_KEYS.tasks)).toEqual(['account a only']);
    a.clear(); b.clear();
    expect(a.getQueryCache().getAll()).toEqual([]);
  });

  it('forces a new read after invalidation and never automatically retries failed reads or writes', async () => {
    const client = createDashboardQueryClient();
    const load = vi.fn().mockResolvedValueOnce(['old']).mockResolvedValueOnce(['new']);
    const options = { queryKey: DASHBOARD_KEYS.tenant, queryFn: load };
    await client.fetchQuery(options);
    await client.invalidateQueries({ queryKey: DASHBOARD_KEYS.tenant });
    expect(await client.fetchQuery(options)).toEqual(['new']);
    expect(load).toHaveBeenCalledTimes(2);
    const failed = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(client.fetchQuery({ queryKey: DASHBOARD_KEYS.tasks, queryFn: failed })).rejects.toThrow('offline');
    expect(failed).toHaveBeenCalledTimes(1);
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
    client.clear();
  });
});

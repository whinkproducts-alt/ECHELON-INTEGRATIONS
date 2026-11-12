import { QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDashboardQueryClient, DASHBOARD_KEYS } from '@/lib/dashboard-query-cache';
import { fetchDashboardProjects, readMonitorProjects } from '@/lib/dashboard-projects';

afterEach(() => vi.unstubAllGlobals());

describe('shared Monitor and project page reads', () => {
  it('coalesces actual endpoint reads and aborts obsolete Monitor-only requests', async () => {
    let transportSignal!: AbortSignal;
    const fetcher = vi.fn((_url, init) => {
      transportSignal = init.signal;
      return new Promise((_resolve, reject) => transportSignal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    });
    vi.stubGlobal('fetch', fetcher);
    const client = createDashboardQueryClient();
    const controller = new AbortController();
    const pending = expect(readMonitorProjects(client, controller.signal)).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/projects', expect.anything());
    controller.abort(); await pending;
    expect(transportSignal.aborted).toBe(true);
    client.clear();
  });

  it('does not cancel a shared read still observed by the Projects page', async () => {
    let finish!: (response: Response) => void;
    let transportSignal!: AbortSignal;
    const fetcher = vi.fn((_url, init) => { transportSignal = init.signal; return new Promise<Response>((resolve) => { finish = resolve; }); });
    vi.stubGlobal('fetch', fetcher);
    const client = createDashboardQueryClient();
    const observer = new QueryObserver(client, { queryKey: DASHBOARD_KEYS.projects, queryFn: ({ signal }) => fetchDashboardProjects(signal) });
    const unsubscribe = observer.subscribe(() => {});
    const controller = new AbortController();
    const pending = readMonitorProjects(client, controller.signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
    controller.abort();
    expect(transportSignal.aborted).toBe(false);
    finish(Response.json([{ id: 'own-project' }]));
    expect(await pending).toEqual([{ id: 'own-project' }]);
    expect(observer.getCurrentResult().data).toEqual([{ id: 'own-project' }]);
    unsubscribe(); client.clear();
  });
});

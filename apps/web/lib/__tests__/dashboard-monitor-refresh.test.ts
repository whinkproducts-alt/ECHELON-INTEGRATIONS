import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMonitorSection, startMonitorPolling } from '@/lib/dashboard-monitor-refresh';

let visibility: EventTarget;
let hidden = false;
beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  visibility = new EventTarget();
  vi.stubGlobal('document', visibility);
  Object.defineProperty(document, 'hidden', { get: () => hidden });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('monitor request lifecycle', () => {
  it('owns no timers or network work while the dashboard panel is inactive', async () => {
    const load = vi.fn(async () => {});
    const tick = vi.fn();
    const poll = startMonitorPolling(false, load, tick);
    poll.refresh();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(load).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    poll.stop();
  });

  it('polls when visible, aborts on hide, refreshes on return and stops cleanly', async () => {
    const signals: AbortSignal[] = [];
    const load = vi.fn(async (signal: AbortSignal) => { signals.push(signal); });
    const tick = vi.fn();
    const poll = startMonitorPolling(true, load, tick);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    hidden = true; visibility.dispatchEvent(new Event('visibilitychange'));
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(tick).not.toHaveBeenCalled();
    hidden = false; visibility.dispatchEvent(new Event('visibilitychange'));
    expect(load).toHaveBeenCalledTimes(2);
    expect(signals[1].aborted).toBe(false);
    poll.stop();
    expect(signals[1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    visibility.dispatchEvent(new Event('visibilitychange'));
    poll.refresh();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('publishes a fast section without waiting for a stalled sibling and ignores late cancelled results', async () => {
    const controller = new AbortController();
    let finish!: (value: string) => void;
    const slow = new Promise<string>((resolve) => { finish = resolve; });
    const success = vi.fn(); const failure = vi.fn();
    const pending = loadMonitorSection(() => slow, controller.signal, success, failure);
    await loadMonitorSection(async () => 'worker ready', controller.signal, success, failure);
    expect(success).toHaveBeenCalledExactlyOnceWith('worker ready');
    controller.abort(); finish('stale projects'); await pending;
    expect(success).toHaveBeenCalledTimes(1);
    expect(failure).not.toHaveBeenCalled();
  });

  it('reports a section failure without discarding successful sections', async () => {
    const signal = new AbortController().signal;
    const success = vi.fn(); const failure = vi.fn();
    const error = new Error('Service unavailable');
    await Promise.all([
      loadMonitorSection(async () => { throw error; }, signal, success, failure),
      loadMonitorSection(async () => 'ledger ready', signal, success, failure),
    ]);
    expect(success).toHaveBeenCalledWith('ledger ready');
    expect(failure).toHaveBeenCalledWith(error);
  });
});

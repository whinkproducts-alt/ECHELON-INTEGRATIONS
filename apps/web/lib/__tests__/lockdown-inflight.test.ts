import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const recordActionSafe = vi.fn().mockResolvedValue({ id: 'l' });
const isLockedDown = vi.fn();
vi.mock('@/lib/ledger', () => ({ recordActionSafe: (e: unknown) => recordActionSafe(e) }));
vi.mock('@/lib/safety/lockdown', () => ({ isLockedDown: (u: string) => isLockedDown(u) }));
import { registerInflight, stopInflight, watchLockdown } from '@/lib/safety/inflight';

beforeEach(() => { recordActionSafe.mockClear(); isLockedDown.mockReset(); });
afterEach(() => vi.useRealTimers());

describe('in-flight work and lockdown', () => {
  it('stopInflight aborts running work for that account only and ledgers counts', async () => {
    const a = registerInflight('u1', 'job');
    const b = registerInflight('u1', 'speech');
    const other = registerInflight('u2', 'job');
    const counts = await stopInflight('u1', 'c1');
    expect(counts).toEqual({ job: 1, speech: 1 });
    expect(a.signal.aborted && b.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false);
    expect(recordActionSafe).toHaveBeenCalledTimes(1);
    expect(recordActionSafe.mock.calls[0][0]).toMatchObject({ userId: 'u1', action: 'lockdown_inflight_stopped', inputSummary: 'job=1 speech=1' });
    other.done();
  });
  it('nothing running writes no ledger row', async () => {
    expect(await stopInflight('u3', 'c')).toEqual({});
    expect(recordActionSafe).not.toHaveBeenCalled();
  });
  it('a finished task is not aborted', async () => {
    const a = registerInflight('u4', 'job');
    a.done();
    await stopInflight('u4', 'c');
    expect(a.signal.aborted).toBe(false);
  });
  it('watchLockdown aborts a running job from another process and ledgers it', async () => {
    vi.useFakeTimers();
    isLockedDown.mockResolvedValue(false);
    const ac = new AbortController();
    const stop = watchLockdown('u5', ac, 'c5', 100);
    await vi.advanceTimersByTimeAsync(150);
    expect(ac.signal.aborted).toBe(false);
    isLockedDown.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(150);
    expect(ac.signal.aborted).toBe(true);
    expect((ac.signal.reason as Error).message).toBe('lockdown');
    expect(recordActionSafe).toHaveBeenCalledTimes(1);
    stop();
  });
});

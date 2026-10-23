import { describe, it, expect } from 'vitest';
import { HoloBridge, initialState, reduce } from '@/lib/gesture/holo-bridge';

describe('HOLO bridge', () => {
  it('reducer is pure and bumps the version', () => {
    const s = initialState();
    const n = reduce(s, { intent: 'pause' }, 'palm', 5);
    expect(s.version).toBe(0);
    expect(n).toMatchObject({ version: 1, mode: 'paused', lastGesture: { type: 'palm', at: 5 } });
  });

  it('publishes state events to that user only', () => {
    const b = new HoloBridge();
    const a: string[] = [];
    const o: string[] = [];
    b.subscribe('u1', (e) => a.push(e.type));
    b.subscribe('u2', (e) => o.push(e.type));
    b.apply('u1', { intent: 'refresh' }, 'circle');
    expect(a).toEqual(['state']);
    expect(o).toEqual([]);
  });

  it('unsubscribe stops delivery, cap of 5 streams per user, a throwing listener does not block others', () => {
    const b = new HoloBridge();
    const got: number[] = [];
    const unsubs = [1, 2, 3, 4, 5].map((i) => b.subscribe('u', () => got.push(i)));
    expect(b.subscribe('u', () => {})).toBeNull();
    unsubs[0]!();
    b.subscribe('u', () => { throw new Error('x'); });
    b.apply('u', { intent: 'refresh' }, 'circle');
    expect(got.sort()).toEqual([2, 3, 4, 5]);
  });

  it('state events carry ids and enums, not text', () => {
    const b = new HoloBridge();
    const s = b.apply('u', { intent: 'open_thread', taskId: 't1' }, 'pinch');
    expect(Object.keys(s).sort()).toEqual(
      ['briefRequestedAt', 'focusIndex', 'focusedAgentId', 'lastGesture', 'mode', 'openTaskId', 'pendingApprovalId', 'refreshedAt', 'version'],
    );
  });
});

/** R08 conditional blink: timing engine and flag. Rendering is checked visually; this covers behaviour. */
import { describe, it, expect } from 'vitest';
import { BlinkScheduler, DEFAULT_BLINK, blinkFlagEnabled } from '@/components/avatar/avatar-engine';
import { whinkAvatarAnimation } from '@/components/avatar/whink-avatar-animations';
import { mambaAvatarAnimation } from '@/components/avatar/mamba-avatar-animations';

/** Shortest gap, never a double blink: calls alternate gap (0) and double-blink roll (0.5). */
const shortSingle = () => { let i = 0; return () => (i++ % 2 === 0 ? 0 : 0.5); };
const run = (s: BlinkScheduler, ms: number, step = 16) => { const out: number[] = []; for (let t = 0; t < ms; t += step) out.push(s.update(step)); return out; };

describe('blink flag', () => {
  it('is off unless explicitly true (default keeps the no-blink behaviour)', () => {
    expect(blinkFlagEnabled({})).toBe(false);
    expect(blinkFlagEnabled({ NEXT_PUBLIC_AVATAR_BLINK: '1' })).toBe(false);
    expect(blinkFlagEnabled({ NEXT_PUBLIC_AVATAR_BLINK: 'true' })).toBe(true);
  });
});

describe('BlinkScheduler', () => {
  it('stays open before the first gap, then closes fully and reopens', () => {
    const s = new BlinkScheduler(shortSingle());
    const frames = run(s, DEFAULT_BLINK.minGapMs + 600);
    const firstGapFrames = Math.floor((DEFAULT_BLINK.minGapMs - 16) / 16);
    expect(frames.slice(0, firstGapFrames).every((c) => c === 0)).toBe(true);
    expect(Math.max(...frames)).toBe(1);
    expect(frames[frames.length - 1]).toBe(0);
  });
  it('closure is always within 0..1', () => {
    const s = new BlinkScheduler(() => 0.5);
    for (const c of run(s, 30_000, 7)) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(1); }
  });
  it('a blink is brief: under 300 ms from first movement to fully open', () => {
    const s = new BlinkScheduler(() => 0);
    const frames = run(s, DEFAULT_BLINK.minGapMs + 1000, 1);
    const start = frames.findIndex((c) => c > 0);
    const end = frames.findIndex((c, i) => i > start && c === 0);
    expect(end - start).toBeLessThan(300);
  });
  it('blinks a plausible number of times per minute', () => {
    let seed = 42;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const frames = run(new BlinkScheduler(rng), 60_000);
    let blinks = 0;
    for (let i = 1; i < frames.length; i++) if (frames[i] > 0 && frames[i - 1] === 0) blinks++;
    expect(blinks).toBeGreaterThanOrEqual(8);
    expect(blinks).toBeLessThanOrEqual(25);
  });
  it('a huge frame gap (tab was hidden) does not skip straight through a blink', () => {
    const s = new BlinkScheduler(() => 0);
    expect(s.update(60_000)).toBe(0);
  });
});

describe('eye anchors', () => {
  it.each([['WHINK', whinkAvatarAnimation], ['MAMBA', mambaAvatarAnimation]])('%s anchors sit above the mouth, inside the portrait, left of right', (_n, a) => {
    expect(a.eyes).toBeDefined();
    const { left, right } = a.eyes!;
    for (const e of [left, right]) {
      expect(e.x).toBeGreaterThan(0); expect(e.x).toBeLessThan(1);
      expect(e.y).toBeLessThan(a.mouth.y);
      expect(e.y - e.h * 1.4).toBeGreaterThan(0);
    }
    expect(left.x).toBeLessThan(right.x);
  });
});

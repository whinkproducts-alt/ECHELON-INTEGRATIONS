import { describe, it, expect } from 'vitest';
import { createVad, VAD } from '@/lib/voice-vad';

/** Run a level pattern at 100 ms steps and return the first non-continue verdict with its time. */
function run(levels: (t: number) => number, until = 20_000) {
  const vad = createVad(0);
  for (let t = 0; t <= until; t += 100) {
    const verdict = vad(levels(t), t);
    if (verdict !== 'continue') return { verdict, t };
  }
  return { verdict: 'continue' as const, t: until };
}

describe('end-of-speech detection', () => {
  it('ends the turn about 1.4 s after speech stops', () => {
    const r = run((t) => (t >= 800 && t < 3000 ? 0.15 : 0.004));
    expect(r.verdict).toBe('end');
    expect(r.t).toBeGreaterThanOrEqual(3000 + VAD.silenceMs);
    expect(r.t).toBeLessThan(3000 + VAD.silenceMs + 300);
  });

  it('keeps listening through a short pause inside a sentence', () => {
    const r = run((t) => (t < 3000 || (t >= 3800 && t < 6000) ? 0.15 : 0.004), 6000);
    expect(r.verdict).toBe('continue');
  });

  it('gives up when nobody speaks', () => {
    const r = run(() => 0.004);
    expect(r.verdict).toBe('no-speech');
    expect(r.t).toBeGreaterThan(VAD.noSpeechMs);
  });

  it('adapts to a noisy room: steady background noise alone is not speech', () => {
    expect(run(() => 0.03).verdict).toBe('no-speech');
  });

  it('still hears speech that is clearly louder than a noisy room', () => {
    const r = run((t) => (t >= 1000 && t < 2500 ? 0.2 : 0.03));
    expect(r.verdict).toBe('end');
  });

  it('a flat zero signal is unreadable, never "silence", so it cannot cut the user off', () => {
    expect(run(() => 0).verdict).toBe('unreadable');
  });
});

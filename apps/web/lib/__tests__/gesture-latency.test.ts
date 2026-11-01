import { describe, it, expect } from 'vitest';
import { recognize } from '@/lib/gesture/recognize';
import { issueSession, sign, verify } from '@/lib/gesture/hmac';
import { validateGestureRequest } from '@/lib/gesture/validate';
import { holdFrames, POSES, place, localHand } from './fixtures/hand-poses';
import type { Frame } from '@/lib/gesture/types';

process.env.GESTURE_HMAC_SECRET = 'ef'.repeat(32);

function pctl(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

describe('compute latency of the in-process gesture path (no network, no database)', () => {
  it('verify + validate + recognise stays far under 50 ms at the worst case of 30 frames', () => {
    const frames: Frame[] = [];
    for (let i = 0; i < 30; i++) frames.push({ t: i * 33, landmarks: place(localHand(POSES.palm), { cx: 0.5 + 0.1 * Math.sin(i / 3) }) });
    const s = issueSession('u1');
    const body = JSON.stringify({ sessionId: s.sessionId, nonce: 'n'.repeat(20), timestamp: Date.now(), handedness: 'Right', frames });
    const sig = sign(Buffer.from(s.key, 'hex'), body);
    for (let i = 0; i < 200; i++) { verify('u1', s.sessionId, sig, body); recognize(frames); } // warm up
    const times: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const t0 = performance.now();
      verify('u1', s.sessionId, sig, body);
      const v = validateGestureRequest(JSON.parse(body));
      if (!v.ok) throw new Error(v.error);
      recognize(v.value.frames);
      times.push(performance.now() - t0);
    }
    const p50 = pctl(times, 50);
    const p99 = pctl(times, 99);
    console.log(`gesture compute path, 30 frames: p50=${p50.toFixed(3)}ms p99=${p99.toFixed(3)}ms max=${Math.max(...times).toFixed(3)}ms`);
    expect(p99).toBeLessThan(10);
  });

  it('typical 6 frame static request', () => {
    const frames = holdFrames(POSES.point, 6);
    const times: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const t0 = performance.now();
      recognize(frames);
      times.push(performance.now() - t0);
    }
    console.log(`recognise, 6 frames: p50=${pctl(times, 50).toFixed(4)}ms p99=${pctl(times, 99).toFixed(4)}ms`);
    expect(pctl(times, 99)).toBeLessThan(5);
  });
});

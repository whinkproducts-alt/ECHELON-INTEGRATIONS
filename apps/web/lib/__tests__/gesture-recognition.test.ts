import { describe, it, expect, beforeEach } from 'vitest';
import { recognize } from '@/lib/gesture/recognize';
import { classifyStatic } from '@/lib/gesture/classifier';
import { GESTURE_TYPES, type Frame } from '@/lib/gesture/types';
import { LM } from '@/lib/gesture/landmarks';
import { registerEncoder } from '@/lib/gesture/confidence';
import { POSES, THUMBS_DOWN_ROTATE, THUMBS_UP_ROTATE, holdFrames, localHand, place, type Pose } from './fixtures/hand-poses';

beforeEach(() => registerEncoder(null));

const frame = (pose: Pose, t: number, o = {}): Frame => ({ t, landmarks: place(localHand(pose), o) });

describe('static gestures', () => {
  const cases: Array<[string, Frame[]]> = [
    ['palm', holdFrames(POSES.palm, 6)],
    ['peace', holdFrames(POSES.peace, 6)],
    ['point', holdFrames(POSES.point, 6)],
    ['pinch', holdFrames(POSES.pinch, 6)],
    ['thumbs_up', holdFrames(POSES.thumbs, 6, { rotate: THUMBS_UP_ROTATE })],
    ['thumbs_down', holdFrames(POSES.thumbs, 6, { rotate: THUMBS_DOWN_ROTATE })],
  ];
  for (const [name, frames] of cases) {
    it(`recognises ${name}`, () => {
      const r = recognize(frames);
      expect(r?.gesture).toBe(name);
      expect(r!.confidence.total).toBeGreaterThan(200);
      expect(r!.confidence.encoder).toBe(0);
    });
  }

  it('is invariant to hand rotation and scale for point', () => {
    for (const rotate of [-40, 0, 35]) {
      for (const scale of [0.1, 0.2, 0.35]) {
        expect(recognize(holdFrames(POSES.point, 6, { rotate, scale }))?.gesture).toBe('point');
      }
    }
  });

  it('a closed fist is not any gesture', () => {
    expect(classifyStatic(place(localHand(POSES.fist)))).toBeNull();
  });

  it('a single frame can still classify but scores no stability or temporal points', () => {
    const r = recognize(holdFrames(POSES.point, 1))!;
    expect(r.gesture).toBe('point');
    expect(r.confidence.stability).toBe(0);
    expect(r.confidence.temporal).toBe(0);
    expect(r.confidence.total).toBeLessThanOrEqual(180);
  });
});

describe('dynamic gestures', () => {
  it('crush: open palm closing to a fist', () => {
    const frames: Frame[] = [];
    for (let i = 0; i <= 8; i++) {
      const openT = 1 - i / 8;
      frames.push(frame({ ...POSES.palm, thumb: 'curl', openT }, i * 33));
    }
    const r = recognize(frames);
    expect(r?.gesture).toBe('crush');
    expect(r!.confidence.total).toBeGreaterThan(200);
  });

  it('a slow, partial close is not a crush', () => {
    const frames: Frame[] = [];
    for (let i = 0; i <= 8; i++) frames.push(frame({ ...POSES.palm, thumb: 'curl', openT: 1 - (i / 8) * 0.3 }, i * 33));
    expect(recognize(frames)?.gesture).not.toBe('crush');
  });

  it('flick: pointing finger snaps sideways', () => {
    const frames: Frame[] = [];
    for (let i = 0; i < 6; i++) frames.push(frame(POSES.point, i * 40, { cx: 0.3 + i * 0.05 }));
    const r = recognize(frames);
    expect(r?.gesture).toBe('flick');
    expect(r?.detail.direction).toBe('right');
  });

  it('circle: index tip traces a loop', () => {
    const frames: Frame[] = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 * Math.PI * 1.05;
      frames.push(frame(POSES.point, i * 40, { cx: 0.5 + 0.08 * Math.cos(a), cy: 0.7 + 0.08 * Math.sin(a) }));
    }
    const r = recognize(frames);
    expect(r?.gesture).toBe('circle');
    expect(r?.detail.direction).toBe('cw');
  });

  it('wave: open palm swinging side to side', () => {
    const frames: Frame[] = [];
    for (let i = 0; i < 30; i++) {
      frames.push(frame(POSES.palm, i * 33, { cx: 0.5 + 0.12 * Math.sin((i / 30) * 2 * Math.PI * 3) }));
    }
    expect(recognize(frames)?.gesture).toBe('wave');
  });

  it('a still palm is palm, not wave', () => {
    expect(recognize(holdFrames(POSES.palm, 20))?.gesture).toBe('palm');
  });
});

describe('confidence scale', () => {
  it('never exceeds 300 and parts stay within their caps', () => {
    registerEncoder(() => 5); // out of range on purpose
    const c = recognize(holdFrames(POSES.palm, 8))!.confidence;
    expect(c.base).toBeLessThanOrEqual(100);
    expect(c.stability).toBeLessThanOrEqual(60);
    expect(c.geometry).toBeLessThanOrEqual(80);
    expect(c.temporal).toBeLessThanOrEqual(60);
    expect(c.encoder).toBeLessThanOrEqual(50);
    expect(c.total).toBeLessThanOrEqual(300);
    expect(c.total).toBeCloseTo(Math.min(300, c.base + c.stability + c.geometry + c.temporal + c.encoder), 0);
  });

  it('a registered encoder adds up to 50 points; a throwing encoder adds none', () => {
    const without = recognize(holdFrames(POSES.palm, 8))!.confidence.total;
    registerEncoder(() => 1);
    expect(recognize(holdFrames(POSES.palm, 8))!.confidence.total).toBeCloseTo(Math.min(300, without + 50), 0);
    registerEncoder(() => { throw new Error('boom'); });
    expect(recognize(holdFrames(POSES.palm, 8))!.confidence.total).toBeCloseTo(without, 0);
  });

  it('a jittery hand scores lower stability than a steady one', () => {
    const steady = recognize(holdFrames(POSES.point, 8))!.confidence.stability;
    const jittery: Frame[] = Array.from({ length: 8 }, (_, i) => frame(POSES.point, i * 33, { cx: 0.5 + (i % 2 ? 0.05 : -0.05) }));
    const j = recognize(jittery);
    expect(j!.confidence.stability).toBeLessThan(steady);
  });

  it('a hand partly out of frame loses base points', () => {
    const full = recognize(holdFrames(POSES.point, 6, { cy: 0.7 }))!.confidence.base;
    const part = recognize(holdFrames(POSES.point, 6, { cy: 0.22, scale: 0.2 }))!.confidence.base;
    expect(part).toBeLessThan(full);
  });
});

describe('coverage', () => {
  it('lists exactly the 10 required gestures', () => {
    expect([...GESTURE_TYPES].sort()).toEqual(
      ['circle', 'crush', 'flick', 'palm', 'peace', 'pinch', 'point', 'thumbs_down', 'thumbs_up', 'wave'],
    );
  });
  it('landmark index map is the MediaPipe layout', () => {
    expect(LM.INDEX_TIP).toBe(8);
    expect(LM.PINKY_TIP).toBe(20);
  });
});

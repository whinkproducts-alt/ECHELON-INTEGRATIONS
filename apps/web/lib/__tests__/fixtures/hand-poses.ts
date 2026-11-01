/**
 * Synthetic MediaPipe style hands for tests. Built in a palm-size=1 local frame
 * (wrist at origin, fingers toward +y), then rotated, scaled and placed in image space
 * (y down). Not real hand data: it exercises the thresholds, not anatomy.
 */
import type { Frame, Point3 } from '@/lib/gesture/types';

type V = [number, number];
export interface Pose {
  thumb: 'out' | 'curl' | 'pinch';
  index: 'ext' | 'curl';
  middle: 'ext' | 'curl';
  ring: 'ext' | 'curl';
  pinky: 'ext' | 'curl';
  /** Fraction between curled (0) and extended (1) for all four fingers, for crush animation. */
  openT?: number;
  /** Degrees added to every finger direction on top of its natural fan. */
  spread?: number;
}

const MCP: Record<string, V> = { index: [-0.45, 0.95], middle: [-0.05, 1.0], ring: [0.3, 0.95], pinky: [0.62, 0.8] };
const FAN: Record<string, number> = { index: 6, middle: 0, ring: -5, pinky: -12 }; // degrees from +y

function finger(name: string, state: 'ext' | 'curl', t: number | undefined, spread: number): V[] {
  const m = MCP[name];
  const a = ((FAN[name] + (name === 'index' ? spread : name === 'middle' ? 0 : 0)) * Math.PI) / 180;
  const dir: V = [Math.sin(a), Math.cos(a)];
  const e = t ?? (state === 'ext' ? 1 : 0);
  const lerp = (c: V, x: V): V => [c[0] + (x[0] - c[0]) * e, c[1] + (x[1] - c[1]) * e];
  const pip = lerp([m[0], m[1] + 0.3], [m[0] + dir[0] * 0.45, m[1] + dir[1] * 0.45]);
  const dip = lerp([m[0], m[1] + 0.1], [m[0] + dir[0] * 0.73, m[1] + dir[1] * 0.73]);
  const tip = lerp([m[0], m[1] - 0.05], [m[0] + dir[0] * 0.98, m[1] + dir[1] * 0.98]);
  return [m, pip, dip, tip];
}

export function localHand(p: Pose): V[] {
  const spread = p.spread ?? 0;
  const idx = finger('index', p.index, p.openT, spread);
  const mid = finger('middle', p.middle, p.openT, 0);
  const rng = finger('ring', p.ring, p.openT, 0);
  const pnk = finger('pinky', p.pinky, p.openT, 0);
  let thumb: V[];
  if (p.thumb === 'out') thumb = [[-0.35, 0.25], [-0.55, 0.4], [-0.85, 0.45], [-1.15, 0.5]];
  else if (p.thumb === 'curl') thumb = [[-0.35, 0.25], [-0.2, 0.4], [-0.1, 0.5], [0.0, 0.55]];
  else {
    const tip = idx[3];
    thumb = [[-0.35, 0.25], [-0.35 + (tip[0] + 0.35) * 0.4, 0.25 + (tip[1] - 0.25) * 0.4], [-0.35 + (tip[0] + 0.35) * 0.75, 0.25 + (tip[1] - 0.25) * 0.75], [tip[0] + 0.03, tip[1] - 0.02]];
  }
  return [[0, 0], ...thumb, ...idx, ...mid, ...rng, ...pnk];
}

export interface Place {
  cx?: number;
  cy?: number;
  /** Palm size in image units. */
  scale?: number;
  /** Degrees, positive turns the hand clockwise on screen. */
  rotate?: number;
}

export function place(local: V[], o: Place = {}): Point3[] {
  const { cx = 0.5, cy = 0.7, scale = 0.2, rotate = 0 } = o;
  const r = (rotate * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return local.map(([x, y]) => {
    // local up (+y) -> image up (-y); then rotate clockwise by r on screen.
    const ix = x * scale;
    const iy = -y * scale;
    return [cx + ix * c - iy * s, cy + ix * s + iy * c, 0] as Point3;
  });
}

export const POSES = {
  palm: { thumb: 'out', index: 'ext', middle: 'ext', ring: 'ext', pinky: 'ext' } as Pose,
  peace: { thumb: 'curl', index: 'ext', middle: 'ext', ring: 'curl', pinky: 'curl', spread: 14 } as Pose,
  point: { thumb: 'curl', index: 'ext', middle: 'curl', ring: 'curl', pinky: 'curl' } as Pose,
  fist: { thumb: 'curl', index: 'curl', middle: 'curl', ring: 'curl', pinky: 'curl' } as Pose,
  thumbs: { thumb: 'out', index: 'curl', middle: 'curl', ring: 'curl', pinky: 'curl' } as Pose,
  pinch: { thumb: 'pinch', index: 'ext', middle: 'ext', ring: 'ext', pinky: 'ext' } as Pose,
};

/** thumbs up needs the thumb pointing up on screen: rotate the sideways thumb. */
export const THUMBS_UP_ROTATE = 90; // local thumb points -x; +90 deg clockwise sends it up
export const THUMBS_DOWN_ROTATE = -90;

export function holdFrames(pose: Pose, n: number, o: Place = {}, startT = 0, stepMs = 33): Frame[] {
  const lm = place(localHand(pose), o);
  return Array.from({ length: n }, (_, i) => ({ t: startT + i * stepMs, landmarks: lm.map((p) => [...p] as unknown as Point3) }));
}

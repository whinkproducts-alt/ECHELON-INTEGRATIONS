import type { Frame, Point3 } from './types';

export const LM = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
} as const;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function dist(a: Point3, b: Point3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** 2D distance, used for motion where z is noisy. */
export function dist2(a: Point3, b: Point3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Palm size: wrist to middle finger knuckle. Used to make every measure scale free. */
export function handSize(l: Point3[]): number {
  return Math.max(1e-6, dist(l[LM.WRIST], l[LM.MIDDLE_MCP]));
}

export const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
export type FingerName = (typeof FINGERS)[number];

const FINGER_IDX: Record<FingerName, { mcp: number; pip: number; tip: number }> = {
  index: { mcp: LM.INDEX_MCP, pip: LM.INDEX_PIP, tip: LM.INDEX_TIP },
  middle: { mcp: LM.MIDDLE_MCP, pip: LM.MIDDLE_PIP, tip: LM.MIDDLE_TIP },
  ring: { mcp: LM.RING_MCP, pip: LM.RING_PIP, tip: LM.RING_TIP },
  pinky: { mcp: LM.PINKY_MCP, pip: LM.PINKY_PIP, tip: LM.PINKY_TIP },
};

/**
 * Ratio of wrist to fingertip over wrist to PIP. Above 1 the finger points away from the
 * palm; well below 1 it is folded back. Scale and rotation free.
 */
export function fingerRatio(l: Point3[], f: FingerName): number {
  const i = FINGER_IDX[f];
  return dist(l[LM.WRIST], l[i.tip]) / Math.max(1e-6, dist(l[LM.WRIST], l[i.pip]));
}

export const EXTENDED_RATIO = 1.15;
export const CURLED_RATIO = 1.0;

/** Thumb: tip further from the pinky knuckle than the IP joint is. */
export function thumbRatio(l: Point3[]): number {
  return dist(l[LM.THUMB_TIP], l[LM.PINKY_MCP]) / Math.max(1e-6, dist(l[LM.THUMB_IP], l[LM.PINKY_MCP]));
}

export const THUMB_EXTENDED_RATIO = 1.08;

/** Mean fingertip to wrist distance over palm size, four fingers. Open hand ~1.9, fist ~1.0. */
export function openness(l: Point3[]): number {
  const w = l[LM.WRIST];
  const tips = [LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP];
  const mean = tips.reduce((s, i) => s + dist(w, l[i]), 0) / tips.length;
  return mean / handSize(l);
}

/** 0 at the threshold, 1 at threshold + span, clamped. Direction-aware margin helper. */
export function margin(value: number, threshold: number, span: number, above: boolean): number {
  const d = above ? value - threshold : threshold - value;
  return Math.max(0, Math.min(1, d / span));
}

export function lastFrame(frames: Frame[]): Frame {
  return frames[frames.length - 1];
}

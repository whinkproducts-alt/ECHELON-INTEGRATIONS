/**
 * 300 point confidence scale, computed on the server from raw landmarks.
 *
 *   base       100  hand is fully in view and a plausible size
 *   stability   60  hand is steady and tracked without gaps
 *   geometry    80  how far the pose sits past the decision thresholds
 *   temporal    60  static: pose held across frames; dynamic: motion quality
 *   encoder     50  learned encoder agreement. Pluggable; scores 0 until one is registered.
 *
 * Until an encoder is registered the best reachable total is 250. Thresholds in
 * gesture-intents.ts are set against that, not against 300.
 */

import { LM, clamp01, dist2, handSize } from './landmarks';
import { classifyStatic, type DynamicResult, type StaticResult } from './classifier';
import { CONFIDENCE_MAX, type ConfidenceBreakdown, type Frame } from './types';

export const POINTS = { base: 100, stability: 60, geometry: 80, temporal: 60, encoder: 50 } as const;

export interface EncoderInput {
  frames: Frame[];
  gesture: string;
}
/** Returns 0..1. Must be deterministic, offline and fast (under 5 ms). */
export type EncoderScorer = (input: EncoderInput) => number;

let encoder: EncoderScorer | null = null;
export function registerEncoder(fn: EncoderScorer | null): void {
  encoder = fn;
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function baseScore(f: Frame): number {
  const l = f.landmarks;
  const inView = l.filter((p) => p[0] >= -0.02 && p[0] <= 1.02 && p[1] >= -0.02 && p[1] <= 1.02).length / l.length;
  const hs = handSize(l);
  const sizeOk = hs >= 0.03 && hs <= 0.6 ? 1 : 0.5;
  return POINTS.base * inView * sizeOk;
}

function stabilityScore(frames: Frame[], dynamic: boolean): number {
  const recent = frames.slice(-10);
  if (recent.length < 3) return 0;
  const sizes = recent.map((f) => handSize(f.landmarks));
  const m = mean(sizes);
  const cv = Math.sqrt(mean(sizes.map((s) => (s - m) ** 2))) / m;
  const scaleOk = clamp01(1 - cv / 0.15);
  let maxGap = 0;
  for (let i = 1; i < recent.length; i++) maxGap = Math.max(maxGap, recent[i].t - recent[i - 1].t);
  const gapOk = maxGap <= 100 ? 1 : clamp01(1 - (maxGap - 100) / 200);
  if (dynamic) return POINTS.stability * Math.min(scaleOk, gapOk);
  const jitter = mean(
    recent.slice(1).map((f, i) => dist2(f.landmarks[LM.WRIST], recent[i].landmarks[LM.WRIST]) / handSize(f.landmarks)),
  );
  return POINTS.stability * Math.min(scaleOk, gapOk, clamp01(1 - jitter / 0.15));
}

function staticTemporal(frames: Frame[], gesture: string): number {
  const recent = frames.slice(-5);
  if (recent.length < 3) return 0;
  const agree = recent.filter((f) => classifyStatic(f.landmarks)?.gesture === gesture).length;
  // Needs 3 agreeing frames at minimum (architecture doc: 3 consecutive).
  let run = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (classifyStatic(recent[i].landmarks)?.gesture === gesture) run++;
    else break;
  }
  if (run < 3) return 0;
  return POINTS.temporal * (agree / recent.length) * Math.min(1, recent.length / 5);
}

export function scoreConfidence(
  frames: Frame[],
  result: StaticResult | DynamicResult,
): ConfidenceBreakdown {
  const dynamic = 'temporal' in result;
  const last = frames[frames.length - 1];
  const base = baseScore(last);
  const stability = stabilityScore(frames, dynamic);
  const geometry = POINTS.geometry * clamp01(result.geo);
  const temporal = dynamic ? POINTS.temporal * clamp01((result as DynamicResult).temporal) : staticTemporal(frames, result.gesture);
  let enc = 0;
  if (encoder) {
    try {
      enc = POINTS.encoder * clamp01(encoder({ frames, gesture: result.gesture }));
    } catch {
      enc = 0;
    }
  }
  const r = (n: number): number => Math.round(n * 10) / 10;
  const parts = { base: r(base), stability: r(stability), geometry: r(geometry), temporal: r(temporal), encoder: r(enc) };
  const total = Math.min(CONFIDENCE_MAX, r(parts.base + parts.stability + parts.geometry + parts.temporal + parts.encoder));
  return { ...parts, total };
}

/**
 * Rule based classifier for 10 hand gestures from MediaPipe 21 point landmarks.
 *
 * Pure and deterministic. No model, no network, no clock. The server classifies from raw
 * landmarks; a gesture name sent by a client is never trusted or read.
 *
 * Each result carries geo (0..1): how far the evidence sits past the decision thresholds.
 * The confidence scorer turns that into the geometry points.
 */

import {
  CURLED_RATIO, EXTENDED_RATIO, FINGERS, LM, THUMB_EXTENDED_RATIO,
  dist, fingerRatio, handSize, margin, openness, thumbRatio,
} from './landmarks';
import type { Frame, GestureType, Point3 } from './types';

export interface StaticResult {
  gesture: GestureType;
  geo: number;
}

export interface DynamicResult extends StaticResult {
  /** 0..1 quality of the motion itself (timing, monotonicity, regularity). */
  temporal: number;
  detail: Record<string, string | number | boolean>;
}

type FState = 'ext' | 'curl' | 'amb';

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function fingerState(r: number): FState {
  if (r >= EXTENDED_RATIO) return 'ext';
  if (r <= CURLED_RATIO) return 'curl';
  return 'amb';
}

const extGeo = (r: number): number => margin(r, EXTENDED_RATIO, 0.35, true);
const curlGeo = (r: number): number => margin(r, CURLED_RATIO, 0.3, false);

export const PINCH_MAX = 0.3;

/** Classify a single frame. Returns null when the pose matches none of the static gestures. */
export function classifyStatic(l: Point3[]): StaticResult | null {
  const hs = handSize(l);
  const r = FINGERS.map((f) => fingerRatio(l, f));
  const st = r.map(fingerState);
  const th = thumbRatio(l);
  const thumbExt = th >= THUMB_EXTENDED_RATIO;
  const [iS, mS, rS, pS] = st;

  // pinch: thumb tip meets index tip, index not folded into a fist.
  const pd = dist(l[LM.THUMB_TIP], l[LM.INDEX_TIP]) / hs;
  if (pd < PINCH_MAX && iS !== 'curl') {
    return { gesture: 'pinch', geo: margin(pd, PINCH_MAX, 0.2, false) };
  }

  if (iS === 'ext' && mS === 'ext' && rS === 'ext' && pS === 'ext') {
    return { gesture: 'palm', geo: mean(r.map(extGeo)) };
  }

  if (iS === 'ext' && mS === 'ext' && rS === 'curl' && pS === 'curl') {
    const v1 = [l[LM.INDEX_TIP][0] - l[LM.INDEX_MCP][0], l[LM.INDEX_TIP][1] - l[LM.INDEX_MCP][1]];
    const v2 = [l[LM.MIDDLE_TIP][0] - l[LM.MIDDLE_MCP][0], l[LM.MIDDLE_TIP][1] - l[LM.MIDDLE_MCP][1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / Math.max(1e-6, Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]));
    const spreadDeg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    return {
      gesture: 'peace',
      geo: mean([extGeo(r[0]), extGeo(r[1]), curlGeo(r[2]), curlGeo(r[3]), margin(spreadDeg, 4, 8, true)]),
    };
  }

  if (iS === 'ext' && mS === 'curl' && rS === 'curl' && pS === 'curl') {
    return { gesture: 'point', geo: mean([extGeo(r[0]), curlGeo(r[1]), curlGeo(r[2]), curlGeo(r[3])]) };
  }

  if (iS === 'curl' && mS === 'curl' && rS === 'curl' && pS === 'curl' && thumbExt) {
    const vx = l[LM.THUMB_TIP][0] - l[LM.THUMB_MCP][0];
    const vy = l[LM.THUMB_TIP][1] - l[LM.THUMB_MCP][1];
    const len = Math.max(1e-6, Math.hypot(vx, vy));
    const vertical = Math.abs(vy) / len; // 1 = straight up/down
    if (vertical >= 0.7) {
      const geo = mean([...r.map(curlGeo), margin(th, THUMB_EXTENDED_RATIO, 0.12, true), margin(vertical, 0.7, 0.25, true)]);
      return { gesture: vy < 0 ? 'thumbs_up' : 'thumbs_down', geo };
    }
  }
  return null;
}

// ── Dynamic gestures ────────────────────────────────────────────────────────────

const tipOf = (f: Frame, i: number): Point3 => f.landmarks[i];

function windowFrom(frames: Frame[], ms: number): Frame[] {
  const tEnd = frames[frames.length - 1].t;
  return frames.filter((f) => f.t >= tEnd - ms);
}

function crush(frames: Frame[]): DynamicResult | null {
  const win = windowFrom(frames, 800);
  if (win.length < 3) return null;
  const tEnd = win[win.length - 1].t;
  const op = win.map((f) => openness(f.landmarks));
  let peak = 0;
  for (let i = 1; i < op.length; i++) if (op[i] > op[peak]) peak = i;
  const openStart = op[peak];
  const closedEnd = op[op.length - 1];
  const span = tEnd - win[peak].t;
  if (openStart < 1.6 || closedEnd > 1.2 || span < 100) return null;
  let drops = 0;
  let steps = 0;
  for (let i = peak + 1; i < op.length; i++) {
    steps++;
    if (op[i] <= op[i - 1] + 0.02) drops++;
  }
  const mono = steps ? drops / steps : 0;
  if (mono < 0.6) return null;
  const timing = span >= 150 && span <= 500 ? 1 : 0.6;
  return {
    gesture: 'crush',
    geo: mean([margin(openStart, 1.6, 0.3, true), margin(closedEnd, 1.2, 0.3, false)]),
    temporal: mono * timing,
    detail: { spanMs: Math.round(span) },
  };
}

function wave(frames: Frame[]): DynamicResult | null {
  if (frames.length < 8) return null;
  const dur = frames[frames.length - 1].t - frames[0].t;
  if (dur < 500) return null;
  const statics = frames.map((f) => classifyStatic(f.landmarks));
  const palms = statics.filter((s) => s?.gesture === 'palm');
  if (palms.length / frames.length < 0.7) return null;
  const xs = frames.map((f) => f.landmarks[LM.WRIST][0] / handSize(f.landmarks));
  // Turning points with hysteresis against noise.
  const NOISE = 0.05;
  const turns: number[] = [xs[0]];
  let dir = 0;
  let ext = xs[0];
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i];
    if (dir === 0) {
      if (Math.abs(x - ext) > NOISE) { dir = x > ext ? 1 : -1; ext = x; }
    } else if (dir === 1) {
      if (x > ext) ext = x;
      else if (ext - x > NOISE) { turns.push(ext); dir = -1; ext = x; }
    } else if (x < ext) ext = x;
    else if (x - ext > NOISE) { turns.push(ext); dir = 1; ext = x; }
  }
  turns.push(ext);
  const swings: number[] = [];
  for (let i = 1; i < turns.length; i++) swings.push(Math.abs(turns[i] - turns[i - 1]));
  const good = swings.filter((s) => s >= 0.35);
  if (good.length < 3) return null;
  return {
    gesture: 'wave',
    geo: mean(palms.map((p) => p!.geo)),
    temporal: Math.min(1, good.length / 4) * (good.length / swings.length),
    detail: { swings: good.length },
  };
}

function indexPointing(l: Point3[]): boolean {
  return fingerRatio(l, 'index') >= EXTENDED_RATIO;
}

function circle(frames: Frame[]): DynamicResult | null {
  if (frames.length < 10) return null;
  const dur = frames[frames.length - 1].t - frames[0].t;
  if (dur < 400 || dur > 2000) return null;
  const pointing = frames.filter((f) => indexPointing(f.landmarks)).length / frames.length;
  if (pointing < 0.6) return null;
  const pts = frames.map((f) => {
    const hs = handSize(f.landmarks);
    const t = tipOf(f, LM.INDEX_TIP);
    return [t[0] / hs, t[1] / hs] as const;
  });
  const cx = mean(pts.map((p) => p[0]));
  const cy = mean(pts.map((p) => p[1]));
  const radii = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const meanR = mean(radii);
  if (meanR < 0.25) return null;
  const cv = Math.sqrt(mean(radii.map((r) => (r - meanR) ** 2))) / meanR;
  if (cv > 0.35) return null;
  let sweep = 0;
  const steps: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a0 = Math.atan2(pts[i - 1][1] - cy, pts[i - 1][0] - cx);
    const a1 = Math.atan2(pts[i][1] - cy, pts[i][0] - cx);
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    steps.push(d);
    sweep += d;
  }
  if (Math.abs(sweep) < 4.71) return null;
  const same = steps.filter((d) => Math.sign(d) === Math.sign(sweep)).length / steps.length;
  if (same < 0.85) return null;
  return {
    gesture: 'circle',
    geo: mean([margin(cv, 0.35, 0.25, false), margin(Math.abs(sweep), 4.71, 1.5, true)]),
    temporal: same,
    // Image y grows downward, so a positive angle sweep is clockwise on screen.
    detail: { direction: sweep > 0 ? 'cw' : 'ccw' },
  };
}

function flick(frames: Frame[]): DynamicResult | null {
  const win = windowFrom(frames, 300);
  if (win.length < 3) return null;
  const pointing = win.filter((f) => indexPointing(f.landmarks)).length / win.length;
  if (pointing < 0.5) return null;
  const pts = win.map((f) => {
    const hs = handSize(f.landmarks);
    const t = tipOf(f, LM.INDEX_TIP);
    return [t[0] / hs, t[1] / hs] as const;
  });
  let path = 0;
  for (let i = 1; i < pts.length; i++) path += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const dx = pts[pts.length - 1][0] - pts[0][0];
  const dy = pts[pts.length - 1][1] - pts[0][1];
  const D = Math.hypot(dx, dy);
  if (D < 0.8) return null;
  const straight = D / Math.max(1e-6, path);
  if (straight < 0.75) return null;
  const dur = win[win.length - 1].t - win[0].t;
  const dirName = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  return {
    gesture: 'flick',
    geo: mean([margin(D, 0.8, 0.6, true), margin(straight, 0.75, 0.2, true)]),
    temporal: dur >= 60 && dur <= 300 ? 1 : 0.5,
    detail: { direction: dirName },
  };
}

/** Dynamic detectors in priority order. */
export function classifyDynamic(frames: Frame[]): DynamicResult | null {
  return crush(frames) ?? circle(frames) ?? wave(frames) ?? flick(frames);
}

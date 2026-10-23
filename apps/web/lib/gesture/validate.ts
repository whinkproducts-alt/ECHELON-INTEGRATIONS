import { MAX_SKEW_MS } from './hmac';
import type { Frame, GestureRequest, Point3 } from './types';

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_FRAMES = 30;
export const MAX_WINDOW_MS = 2000;
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const ID_RE = /^[A-Za-z0-9_.:-]{1,200}$/;

type Ok = { ok: true; value: GestureRequest };
type Bad = { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Strict structural validation. Unknown top level keys are rejected. */
export function validateGestureRequest(raw: unknown, nowMs: number = Date.now()): Ok | Bad {
  if (!isObj(raw)) return { ok: false, error: 'body must be an object' };
  const allowed = new Set(['sessionId', 'nonce', 'timestamp', 'handedness', 'frames', 'target']);
  for (const k of Object.keys(raw)) if (!allowed.has(k)) return { ok: false, error: `unknown field ${k.slice(0, 20)}` };

  if (typeof raw.sessionId !== 'string') return { ok: false, error: 'sessionId required' };
  if (typeof raw.nonce !== 'string' || !NONCE_RE.test(raw.nonce)) return { ok: false, error: 'nonce invalid' };
  if (typeof raw.timestamp !== 'number' || !Number.isFinite(raw.timestamp)) return { ok: false, error: 'timestamp invalid' };
  if (Math.abs(nowMs - raw.timestamp) > MAX_SKEW_MS) return { ok: false, error: 'timestamp out of range' };
  if (raw.handedness !== 'Left' && raw.handedness !== 'Right') return { ok: false, error: 'handedness invalid' };

  if (!Array.isArray(raw.frames) || raw.frames.length < 1 || raw.frames.length > MAX_FRAMES) {
    return { ok: false, error: `frames must hold 1 to ${MAX_FRAMES} entries` };
  }
  const frames: Frame[] = [];
  let prevT = -Infinity;
  for (const f of raw.frames) {
    if (!isObj(f) || typeof f.t !== 'number' || !Number.isFinite(f.t)) return { ok: false, error: 'frame.t invalid' };
    if (f.t <= prevT) return { ok: false, error: 'frame times must increase' };
    prevT = f.t;
    if (!Array.isArray(f.landmarks) || f.landmarks.length !== 21) return { ok: false, error: 'frame needs 21 landmarks' };
    const pts: Point3[] = [];
    for (const p of f.landmarks) {
      if (!Array.isArray(p) || p.length !== 3) return { ok: false, error: 'landmark must be [x,y,z]' };
      const [x, y, z] = p as unknown[];
      if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return { ok: false, error: 'landmark must be numeric' };
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return { ok: false, error: 'landmark must be finite' };
      if (x < -0.5 || x > 1.5 || y < -0.5 || y > 1.5 || z < -2 || z > 2) return { ok: false, error: 'landmark out of range' };
      pts.push([x, y, z]);
    }
    frames.push({ t: f.t, landmarks: pts });
  }
  if (frames[frames.length - 1].t - frames[0].t > MAX_WINDOW_MS) return { ok: false, error: 'frame window too long' };

  let target: GestureRequest['target'];
  if (raw.target !== undefined) {
    if (!isObj(raw.target)) return { ok: false, error: 'target invalid' };
    target = {};
    for (const k of Object.keys(raw.target)) {
      if (k !== 'taskId' && k !== 'agentId') return { ok: false, error: 'target field not allowed' };
      const v = raw.target[k];
      if (typeof v !== 'string' || !ID_RE.test(v)) return { ok: false, error: `target.${k} invalid` };
      target[k] = v;
    }
  }
  return {
    ok: true,
    value: {
      sessionId: raw.sessionId,
      nonce: raw.nonce,
      timestamp: raw.timestamp,
      handedness: raw.handedness,
      frames,
      target,
    },
  };
}

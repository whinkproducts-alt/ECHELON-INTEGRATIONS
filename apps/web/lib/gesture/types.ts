/**
 * Gesture pipeline types.
 *
 * Landmarks follow the MediaPipe Hands 21 point layout. x and y are normalised image
 * coordinates (0..1, y grows downward). z is relative depth, wrist = 0.
 */

export const GESTURE_TYPES = [
  'pinch',
  'crush',
  'flick',
  'thumbs_up',
  'thumbs_down',
  'peace',
  'palm',
  'point',
  'wave',
  'circle',
] as const;

export type GestureType = (typeof GESTURE_TYPES)[number];

export type Point3 = readonly [number, number, number];

export interface Frame {
  /** Milliseconds on the client's monotonic clock. Only differences are used. */
  t: number;
  /** Exactly 21 points. */
  landmarks: Point3[];
}

export type Handedness = 'Left' | 'Right';

export interface GestureRequest {
  sessionId: string;
  /** Single use value, 16 to 64 chars of [A-Za-z0-9_-]. */
  nonce: string;
  /** Client wall clock, epoch ms. Must be within the skew window of server time. */
  timestamp: number;
  handedness: Handedness;
  /** 1 to 30 frames, oldest first. The last frame is "now". */
  frames: Frame[];
  /** Untrusted hints from the HOLO UI hit test. Always re-verified server side. */
  target?: { taskId?: string; agentId?: string };
}

export interface ConfidenceBreakdown {
  base: number; // 0..100
  stability: number; // 0..60
  geometry: number; // 0..80
  temporal: number; // 0..60
  encoder: number; // 0..50
  total: number; // 0..300
}

export const CONFIDENCE_MAX = 300;

export interface Recognition {
  gesture: GestureType;
  confidence: ConfidenceBreakdown;
  /** Gesture specific facts, e.g. circle direction. Small and typed. */
  detail: Record<string, string | number | boolean>;
}

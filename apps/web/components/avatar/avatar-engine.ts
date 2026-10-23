// Shared avatar animation engine. Pure maths and data, no DOM, safe for SSR and tests.
// Per character files (whink-avatar-animations.ts, mamba-avatar-animations.ts) supply the tuning.
//
// Decision 2026-09-27 stands: avatars do not blink. Motion is audio driven mouth shapes,
// slow breathing, and eased state changes.

export const MOUTH_SHAPES = ['rest', 'closed', 'open', 'wide', 'round', 'teeth'] as const;
export type MouthShape = (typeof MOUTH_SHAPES)[number];

export const AVATAR_STATES = ['idle', 'listening', 'thinking', 'speaking', 'awaiting_approval', 'blocked'] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];

/** Text for every state. The HUD and the page both show it, so colour never carries state alone. */
export const AVATAR_STATE_LABELS: Record<AvatarState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  awaiting_approval: 'Awaiting approval',
  blocked: 'Blocked',
};

/** Which direct transitions are allowed. Anything else is routed through idle. */
const ALLOWED: Record<AvatarState, readonly AvatarState[]> = {
  idle: ['listening', 'thinking', 'speaking', 'awaiting_approval', 'blocked'],
  listening: ['idle', 'thinking', 'blocked'],
  thinking: ['idle', 'speaking', 'awaiting_approval', 'blocked'],
  speaking: ['idle', 'listening', 'awaiting_approval', 'blocked'],
  awaiting_approval: ['idle', 'thinking', 'speaking', 'blocked'],
  blocked: ['idle'],
};

export function canTransition(from: AvatarState, to: AvatarState): boolean {
  return from === to || ALLOWED[from].includes(to);
}

/** The path actually taken from one state to another. A forbidden jump goes via idle. */
export function transitionPath(from: AvatarState, to: AvatarState): AvatarState[] {
  if (from === to) return [to];
  return canTransition(from, to) ? [to] : ['idle', to];
}

/** Continuous visual parameters that ease toward the target of the current state. */
export interface AvatarLook {
  ringAlpha: number;   // 0..1 HUD ring brightness
  ringSpeed: number;   // radians per second
  scanArc: number;     // 0..1 how much of the ring is lit
  glow: number;        // 0..1 outer glow
  tilt: number;        // radians, small head tilt
  lean: number;        // 0..1 forward lean (portrait scale boost)
  desaturate: number;  // 0..1 portrait desaturation (blocked)
  hudAlpha: number;    // 0..1 readout brightness
}

export type StateTargets = Record<AvatarState, AvatarLook>;

export interface PersonaAnimation {
  /** Public path of the compressed portrait. Under the 2 MB per character budget. */
  portrait: string;
  portraitSize: { width: number; height: number };
  /** Mouth anchor as fractions of the portrait. */
  mouth: { x: number; y: number; width: number };
  /** CSS custom property (H S% L% triplet) for the HUD. Token only. */
  hudToken: string;
  /** Persona tuning. */
  breathPeriodSec: number;
  breathAmp: number;
  /** Time constant for state easing in milliseconds. About 2.2 tau to settle. */
  tauMs: number;
  mouthScale: number;
  targets: StateTargets;
}

export function easeLook(current: AvatarLook, target: AvatarLook, dtMs: number, tauMs: number): AvatarLook {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tauMs));
  const out = { ...current };
  (Object.keys(out) as Array<keyof AvatarLook>).forEach((key) => {
    out[key] = current[key] + (target[key] - current[key]) * k;
  });
  return out;
}

/** Breathing as a scale offset around 1 and a vertical drift in portrait fractions. */
export function breathing(tSec: number, period: number, amp: number, speakingLevel: number): { scale: number; dy: number } {
  const phase = Math.sin((tSec / period) * Math.PI * 2);
  return {
    scale: 1 + amp * (0.5 + 0.5 * phase) + speakingLevel * amp * 0.6,
    dy: phase * amp * 0.5,
  };
}

export interface AudioSample {
  /** 0..1 loudness. */
  rms: number;
  /** 0..1 brightness of the spectrum (low = dark vowels, high = hissy). Optional. */
  centroid?: number;
}

/** Deterministic stand in when only loudness is known. Same input time gives the same shape. */
export function pseudoCentroid(tMs: number): number {
  const bucket = Math.floor(tMs / 90);
  const x = Math.sin(bucket * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function classifyMouth(level: number, centroid: number): MouthShape {
  if (level < 0.05) return 'closed';
  if (centroid > 0.62) return level < 0.25 ? 'teeth' : 'wide';
  if (centroid < 0.3) return level > 0.4 ? 'open' : 'round';
  return level > 0.3 ? 'open' : 'wide';
}

/** Smooths loudness and holds each shape long enough to read (no flicker). */
export class MouthTracker {
  private level = 0;
  private shape: MouthShape = 'rest';
  private heldMs = 0;
  private silentMs = 0;

  constructor(private readonly minHoldMs = 70, private readonly attackMs = 35, private readonly releaseMs = 110) {}

  update(dtMs: number, tMs: number, speaking: boolean, sample: AudioSample | null): MouthShape {
    this.heldMs += dtMs;
    if (!speaking) {
      this.level = 0;
      this.silentMs = 0;
      return this.set('rest', true);
    }
    const target = sample ? Math.min(1, Math.max(0, sample.rms)) : 0.45 + 0.35 * Math.sin(tMs / 130);
    const tau = target > this.level ? this.attackMs : this.releaseMs;
    this.level += (target - this.level) * (1 - Math.exp(-dtMs / tau));
    if (this.level < 0.05) this.silentMs += dtMs; else this.silentMs = 0;
    if (this.silentMs > 400) return this.set('rest', true);
    const centroid = sample?.centroid ?? pseudoCentroid(tMs);
    return this.set(classifyMouth(this.level, centroid), false);
  }

  get loudness(): number { return this.level; }

  private set(next: MouthShape, force: boolean): MouthShape {
    if (next !== this.shape && (force || this.heldMs >= this.minHoldMs)) {
      this.shape = next;
      this.heldMs = 0;
    }
    return this.shape;
  }
}

export function lookFromBase(base: AvatarLook, over: Partial<AvatarLook>): AvatarLook {
  return { ...base, ...over };
}

import { lookFromBase, type AvatarLook, type PersonaAnimation, type StateTargets } from './avatar-engine';

// Primary mind. Warm, open, quick to respond.
const BASE: AvatarLook = {
  ringAlpha: 0.55, ringSpeed: 0.25, scanArc: 0.25, glow: 0.25,
  tilt: 0, lean: 0, desaturate: 0, hudAlpha: 0.75,
};

const targets: StateTargets = {
  idle: BASE,
  listening: lookFromBase(BASE, { ringAlpha: 0.9, ringSpeed: 0.9, scanArc: 0.5, glow: 0.45, tilt: 0.035, lean: 0.4 }),
  thinking: lookFromBase(BASE, { ringAlpha: 0.8, ringSpeed: 2.2, scanArc: 0.18, glow: 0.35, tilt: -0.025, hudAlpha: 1 }),
  speaking: lookFromBase(BASE, { ringAlpha: 1, ringSpeed: 0.5, scanArc: 1, glow: 0.7, lean: 0.25, hudAlpha: 1 }),
  awaiting_approval: lookFromBase(BASE, { ringAlpha: 1, ringSpeed: 0.12, scanArc: 0.9, glow: 0.55, lean: 0.15, hudAlpha: 1 }),
  blocked: lookFromBase(BASE, { ringAlpha: 0.9, ringSpeed: 0, scanArc: 1, glow: 0.3, desaturate: 0.55, hudAlpha: 1 }),
};

export const whinkAvatarAnimation: PersonaAnimation = {
  portrait: '/avatar/whink-portrait.webp',
  portraitSize: { width: 630, height: 770 },
  // Mouth located on the cropped portrait (source 545,612 minus crop 250,230).
  mouth: { x: 295 / 630, y: 382 / 770, width: 118 / 630 },
  // Eyes located on the same cropped portrait (behind the glasses lenses).
  eyes: { left: { x: 245 / 630, y: 271 / 770, w: 54 / 630, h: 26 / 770 }, right: { x: 363 / 630, y: 271 / 770, w: 54 / 630, h: 26 / 770 } },
  hudToken: '--hud-whink',
  breathPeriodSec: 4.2,
  breathAmp: 0.008,
  tauMs: 110,
  mouthScale: 1,
  targets,
};

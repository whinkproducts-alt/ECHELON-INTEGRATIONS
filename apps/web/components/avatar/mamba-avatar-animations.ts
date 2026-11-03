import { lookFromBase, type AvatarLook, type PersonaAnimation, type StateTargets } from './avatar-engine';

// Adversarial strategist, Obsidian mode only. Same system as the primary mind,
// tuned colder: slower breathing, slower easing, restrained mouth, little tilt.
const BASE: AvatarLook = {
  ringAlpha: 0.5, ringSpeed: 0.15, scanArc: 0.2, glow: 0.3,
  tilt: 0, lean: 0, desaturate: 0, hudAlpha: 0.7,
};

const targets: StateTargets = {
  idle: BASE,
  listening: lookFromBase(BASE, { ringAlpha: 0.85, ringSpeed: 0.6, scanArc: 0.4, glow: 0.45, lean: 0.55 }),
  thinking: lookFromBase(BASE, { ringAlpha: 0.8, ringSpeed: 1.6, scanArc: 0.12, glow: 0.4, tilt: 0.02, hudAlpha: 1 }),
  speaking: lookFromBase(BASE, { ringAlpha: 1, ringSpeed: 0.35, scanArc: 1, glow: 0.8, lean: 0.35, hudAlpha: 1 }),
  awaiting_approval: lookFromBase(BASE, { ringAlpha: 1, ringSpeed: 0.08, scanArc: 0.9, glow: 0.55, lean: 0.2, hudAlpha: 1 }),
  blocked: lookFromBase(BASE, { ringAlpha: 0.9, ringSpeed: 0, scanArc: 1, glow: 0.35, desaturate: 0.7, hudAlpha: 1 }),
};

export const mambaAvatarAnimation: PersonaAnimation = {
  portrait: '/avatar/mamba-portrait.webp',
  portraitSize: { width: 530, height: 750 },
  // Source mouth 535,612 minus crop 255,110.
  mouth: { x: 280 / 530, y: 502 / 750, width: 120 / 530 },
  eyes: { left: { x: 214 / 530, y: 365 / 750, w: 46 / 530, h: 22 / 750 }, right: { x: 340 / 530, y: 365 / 750, w: 46 / 530, h: 22 / 750 } },
  hudToken: '--hud-mamba',
  breathPeriodSec: 5.4,
  breathAmp: 0.005,
  tauMs: 150,
  mouthScale: 0.85,
  targets,
};

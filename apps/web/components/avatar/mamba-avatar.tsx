'use client';

import { AvatarCanvas, type AvatarCanvasProps } from './avatar-canvas';
import { mambaAvatarAnimation } from './mamba-avatar-animations';

type Props = Omit<AvatarCanvasProps, 'animation'>;

/**
 * Adversarial mind avatar. Obsidian mode only, so there is no mode prop.
 * A persona changes voice, never access.
 */
export function MambaAvatar(props: Props) {
  return <AvatarCanvas animation={mambaAvatarAnimation} {...props} />;
}

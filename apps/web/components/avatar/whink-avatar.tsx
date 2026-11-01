'use client';

import { AvatarCanvas, type AvatarCanvasProps } from './avatar-canvas';
import { whinkAvatarAnimation } from './whink-avatar-animations';

type Props = Omit<AvatarCanvasProps, 'animation'>;

/**
 * Primary mind avatar. Compressed portrait plus sprite layers in canvas, driven by audio.
 * `name` must come from tenant config (useTenantConfig().productName).
 */
export function WhinkAvatar(props: Props) {
  return <AvatarCanvas animation={whinkAvatarAnimation} {...props} />;
}

// Shared tone type for HOLO primitives. Tones map to design token classes in globals.css.
// 'amber' is reserved for pending approvals and limits. 'denial' is reserved for security events.
// Never use colour alone for meaning: pair amber/denial with a text label.
export type HoloTone = 'accent' | 'deep' | 'mamba' | 'ember' | 'amber' | 'denial' | 'neutral';

export const toneClass = (tone: HoloTone = 'accent') => `holo-tone-${tone}`;

'use client';

import Image from 'next/image';

export interface AvatarRendererProps {
  persona: 'WHINK' | 'MAMBA';
  mambaMode?: string | null;
  isSpeaking: boolean;
  isListening: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP = {
  sm: 48,
  md: 80,
  lg: 120,
} as const;

/**
 * Avatar renderer — CSS-only animation, no canvas, no external libs.
 * Ring colour: WHINK uses --whink-accent (#38B6FF), MAMBA uses --mamba-blood (#C41E1E),
 * MAMBA OBSIDIAN uses --ember (#FF4A1C).
 * No hardcoded hex values in JSX — all colours come from CSS custom properties defined in
 * globals.css (--whink-accent, --mamba-blood, --ember).
 */
export function AvatarRenderer({
  persona,
  mambaMode,
  isSpeaking,
  isListening,
  size = 'md',
}: AvatarRendererProps) {
  const px = SIZE_MAP[size];
  const isObsidian = mambaMode === 'OBSIDIAN';
  const isMamba = persona === 'MAMBA';

  // Determine ring colour via CSS custom property name
  let ringColor: string;
  if (isMamba && isObsidian) {
    ringColor = 'hsl(var(--ember))';
  } else if (isMamba) {
    ringColor = 'hsl(var(--mamba-blood))';
  } else {
    ringColor = 'hsl(var(--whink-accent))';
  }

  // Animation class
  let animationStyle: React.CSSProperties = {
    animation: 'avatar-breathe 4s ease-in-out infinite',
  };
  if (isSpeaking) {
    animationStyle = {
      animation: 'avatar-speaking 0.3s ease-in-out infinite',
    };
  }

  // Ring style (only when speaking or listening)
  let ringStyle: React.CSSProperties = {};
  if (isSpeaking) {
    ringStyle = {
      animation: 'avatar-ring-pulse 0.6s ease-in-out infinite',
      color: ringColor,
    };
  } else if (isListening) {
    ringStyle = {
      animation: 'avatar-ring-scan 1.2s ease-in-out infinite',
      color: ringColor,
    };
  }

  const src = isMamba ? '/avatar/mamba.webp' : '/avatar/whink.webp';

  return (
    <div
      className="relative flex-shrink-0 rounded-full"
      style={{ width: px, height: px }}
      data-persona={persona}
      data-speaking={isSpeaking}
      data-listening={isListening}
      data-mamba-mode={mambaMode ?? undefined}
    >
      {/* Ring layer */}
      {(isSpeaking || isListening) && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          style={{
            ...ringStyle,
            boxShadow: `0 0 0 2px ${ringColor}, 0 0 12px 2px ${ringColor}`,
          }}
        />
      )}

      {/* Image wrapper with scale animation */}
      <span
        className="block rounded-full overflow-hidden w-full h-full"
        style={animationStyle}
      >
        <Image
          src={src}
          alt={persona}
          width={px}
          height={px}
          className="rounded-full object-cover w-full h-full"
          priority={size === 'lg'}
        />
      </span>

      {/* MAMBA Obsidian vignette overlay */}
      {isObsidian && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 30%, hsl(var(--mamba-blood) / 0.35) 100%)',
          }}
        />
      )}
    </div>
  );
}

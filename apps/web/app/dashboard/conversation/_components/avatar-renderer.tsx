'use client';

import Image from 'next/image';

export interface AvatarRendererProps {
  persona: 'WHINK' | 'MAMBA';
  mambaMode?: string | null;
  isSpeaking: boolean;
  isListening: boolean;
  size?: 'sm' | 'md' | 'lg';
  /**
   * 0–1 amplitude from AnalyserNode lipsync; drives ring glow + scale.
   * Defaults to 0.5 when speaking without Web Audio (CSS fallback takes over).
   */
  lipSyncAmplitude?: number;
}

const SIZE_MAP = {
  sm: 48,
  md: 80,
  lg: 120,
} as const;

/**
 * Avatar renderer — CSS-only animation base; when lipSyncAmplitude is provided
 * the ring glow and scale are driven in real time from the AnalyserNode.
 * Ring colour: WHINK uses --whink-accent, MAMBA uses --mamba-blood,
 * MAMBA OBSIDIAN uses --ember.
 * No hardcoded hex values in JSX — all colours come from CSS custom properties.
 */
export function AvatarRenderer({
  persona,
  mambaMode,
  isSpeaking,
  isListening,
  size = 'md',
  lipSyncAmplitude = 0,
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

  // ── Lipsync-driven styles ────────────────────────────────────────────────
  // When speaking + amplitude available: drop the CSS keyframe animation and
  // use inline transform so AnalyserNode data drives the frame directly.
  const hasLiveAmplitude = isSpeaking && lipSyncAmplitude > 0;

  const imageWrapperStyle: React.CSSProperties = hasLiveAmplitude
    ? {
        // Scale 1.00 → 1.08 with amplitude
        transform: `scale(${1 + lipSyncAmplitude * 0.08})`,
        transition: 'transform 40ms linear',
        willChange: 'transform',
      }
    : isSpeaking
    ? { animation: 'avatar-speaking 0.3s ease-in-out infinite' }
    : { animation: 'avatar-breathe 4s ease-in-out infinite' };

  // Ring glow: amplitude drives shadow spread and opacity
  let ringStyle: React.CSSProperties = {};
  if (hasLiveAmplitude) {
    // Spread grows from 2px → 8px; blur grows from 8px → 28px
    const spread = 2 + lipSyncAmplitude * 6;
    const blur = 8 + lipSyncAmplitude * 20;
    const opacity = 0.55 + lipSyncAmplitude * 0.45;
    ringStyle = {
      boxShadow: `0 0 0 ${spread}px ${ringColor}, 0 0 ${blur}px ${spread}px ${ringColor}`,
      opacity,
      transition: 'box-shadow 40ms linear, opacity 40ms linear',
      willChange: 'box-shadow, opacity',
    };
  } else if (isSpeaking) {
    ringStyle = {
      animation: 'avatar-ring-pulse 0.6s ease-in-out infinite',
      color: ringColor,
      boxShadow: `0 0 0 2px ${ringColor}, 0 0 12px 2px ${ringColor}`,
    };
  } else if (isListening) {
    ringStyle = {
      animation: 'avatar-ring-scan 1.2s ease-in-out infinite',
      color: ringColor,
      boxShadow: `0 0 0 2px ${ringColor}, 0 0 12px 2px ${ringColor}`,
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
          style={ringStyle}
        />
      )}

      {/* Image wrapper with scale animation (lipsync or CSS) */}
      <span
        className="block rounded-full overflow-hidden w-full h-full"
        style={imageWrapperStyle}
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

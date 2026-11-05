'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

export interface AvatarRendererProps {
  persona: 'WHINK' | 'MAMBA' | 'PETER' | 'PAUL' | 'MICAH' | 'NANDI' | 'SCOUT' | 'REGISTRATION';
  mambaMode?: string | null;
  isSpeaking: boolean;
  isListening: boolean;
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** 0–1 amplitude from AnalyserNode lipsync; drives ring glow + scale. */
  lipSyncAmplitude?: number;
  /** Full-body mode shows the complete avatar with breathing animation */
  fullBody?: boolean;
}

const SIZE_MAP = {
  sm: 48,
  md: 80,
  lg: 120,
  full: 320,
} as const;

const FULL_BODY_SIZES = {
  whink: { width: 280, height: 420 },
  mamba: { width: 280, height: 420 },
} as const;

export function AvatarRenderer({
  persona,
  mambaMode,
  isSpeaking,
  isListening,
  size = 'md',
  lipSyncAmplitude = 0,
  fullBody = false,
}: AvatarRendererProps) {
  const isMamba = persona === 'MAMBA';
  const isObsidian = mambaMode === 'OBSIDIAN';
  const isFullBody = fullBody && (persona === 'WHINK' || persona === 'MAMBA');

  // Determine accent colour via CSS custom property
  let accentColor: string;
  if (isMamba && isObsidian) {
    accentColor = 'hsl(var(--ember))';
  } else if (isMamba) {
    accentColor = 'hsl(var(--mamba-blood))';
  } else {
    accentColor = 'hsl(var(--whink-accent))';
  }

  const hasLiveAmplitude = isSpeaking && lipSyncAmplitude > 0;

  // ── Full-body avatar mode ────────────────────────────────────────────────
  if (isFullBody) {
    const dims = isMamba ? FULL_BODY_SIZES.mamba : FULL_BODY_SIZES.whink;
    const src = isMamba ? '/avatar/mamba.webp' : '/avatar/whink.webp';

    return (
      <motion.div
        className="relative flex-shrink-0"
        style={{ width: dims.width, height: dims.height }}
        data-persona={persona}
        data-speaking={isSpeaking}
        data-listening={isListening}
        data-mamba-mode={mambaMode ?? undefined}
        data-full-body="true"
        animate={{
          scale: isSpeaking && hasLiveAmplitude ? 1 + lipSyncAmplitude * 0.02 : 1,
          y: isSpeaking ? [-2, 2, -2] : 0,
        }}
        transition={{
          scale: { duration: 40, ease: 'linear' },
          y: { duration: 800, ease: 'easeInOut', repeat: Infinity },
        }}
      >
        {/* Ambient glow behind the avatar */}
        {(isSpeaking || isListening) && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: '50% 50% 20% 20%',
              filter: 'blur(40px)',
              opacity: isSpeaking ? 0.6 : 0.3,
            }}
            animate={{
              boxShadow: isSpeaking && hasLiveAmplitude
                ? `0 0 ${80 + lipSyncAmplitude * 100}px ${20 + lipSyncAmplitude * 60}px ${accentColor}`
                : `0 0 60px 20px ${accentColor}`,
              opacity: isSpeaking ? [0.6, 0.9, 0.6] : 0.4,
            }}
            transition={{
              boxShadow: { duration: hasLiveAmplitude ? 0.04 : 0.6, ease: 'linear' },
              opacity: { duration: 1.2, ease: 'easeInOut', repeat: Infinity },
            }}
          />
        )}

        {/* Subtle breathing animation for full body */}
        <motion.div
          className="relative w-full h-full"
          animate={{
            y: isSpeaking ? 0 : [0, -4, 0],
            scale: isSpeaking && hasLiveAmplitude ? 1 + lipSyncAmplitude * 0.015 : 1,
          }}
          transition={{
            y: { duration: isSpeaking ? 0.3 : 4, ease: 'easeInOut', repeat: Infinity },
            scale: { duration: 40, ease: 'linear' },
          }}
        >
          <Image
            src={isMamba ? '/avatar/mamba.webp' : '/avatar/whink.webp'}
            alt={persona}
            width={dims.width}
            height={dims.height}
            className="w-full h-full object-contain"
            priority
            style={{
              filter: isObsidian
                ? 'drop-shadow(0 0 30px hsl(var(--mamba-blood) / 0.5))'
                : 'none',
            }}
          />
        </motion.div>

        {/* MAMBA Obsidian vignette overlay */}
        {isObsidian && (
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: '50% 50% 20% 20%',
              background: 'radial-gradient(ellipse at center, transparent 40%, hsl(var(--mamba-blood) / 0.25) 100%)',
            }}
          />
        )}

        {/* Speaking indicator pulse at bottom */}
        {isSpeaking && (
          <motion.div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[11px] font-mono tracking-widest"
            style={{ color: accentColor }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            <span className="relative w-2 h-2 rounded-full" style={{ background: accentColor }} />
            <span>SPEAKING</span>
            <span className="relative w-2 h-2 rounded-full" style={{ background: accentColor }} />
          </motion.div>
        )}

        {/* Listening indicator */}
        {isListening && !isSpeaking && (
          <motion.div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[11px] font-mono tracking-widest"
            style={{ color: accentColor }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            <span className="relative w-2 h-2 rounded-full" style={{ background: accentColor }} />
            <span>LISTENING</span>
            <span className="relative w-2 h-2 rounded-full" style={{ background: accentColor }} />
          </motion.div>
        )}
      </motion.div>
    );
  }

  // ── Standard orb mode (existing behavior) ────────────────────────────────
  const px = SIZE_MAP[size];

  // Determine ring colour via CSS custom property name
  let ringColor: string;
  if (isMamba && isObsidian) {
    ringColor = 'hsl(var(--ember))';
  } else if (isMamba) {
    ringColor = 'hsl(var(--mamba-blood))';
  } else {
    ringColor = 'hsl(var(--whink-accent))';
  }

  // Lipsync-driven styles
  const imageWrapperStyle: React.CSSProperties = hasLiveAmplitude
    ? {
        transform: `scale(${1 + lipSyncAmplitude * 0.08})`,
        transition: 'transform 40ms linear',
        willChange: 'transform',
      }
    : isSpeaking
    ? { animation: 'avatar-speaking 0.3s ease-in-out infinite' }
    : { animation: 'avatar-breathe 4s ease-in-out infinite' };

  let ringStyle: React.CSSProperties = {};
  if (hasLiveAmplitude) {
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
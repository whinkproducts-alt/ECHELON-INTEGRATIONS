'use client';

import React from 'react';

export type PersonaAvatarSize = 'sm' | 'md' | 'lg';

export interface PersonaAvatarProps {
  name: string;
  email?: string;
  imageUrl?: string;
  size?: PersonaAvatarSize;
  role?: string;
}

// Deterministic hues from WHINK palette — never random on render.
// Pick by Math.abs(hash) % 8
const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#0B4E7A', fg: '#38B6FF' }, // 0 deep blue / accent
  { bg: '#1A2B1A', fg: '#22C55E' }, // 1 forest / green
  { bg: '#2B1A1A', fg: '#FF4A1C' }, // 2 dark red / ember
  { bg: '#1A1A2B', fg: '#8B5CF6' }, // 3 deep indigo / violet
  { bg: '#2B2B1A', fg: '#F5A623' }, // 4 dark gold / amber
  { bg: '#1A2B2B', fg: '#4FF3EE' }, // 5 teal / cyan
  { bg: '#2B1A2B', fg: '#F472B6' }, // 6 dark plum / pink
  { bg: '#1A1A1A', fg: '#8FA3B8' }, // 7 near black / slate
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  }
  return h;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZE_PX: Record<PersonaAvatarSize, number> = { sm: 28, md: 36, lg: 48 };
const FONT_SIZE: Record<PersonaAvatarSize, string> = { sm: '10px', md: '13px', lg: '17px' };

export function PersonaAvatar({ name, imageUrl, size = 'md', role }: PersonaAvatarProps) {
  const px = SIZE_PX[size];
  const palette = PALETTE[Math.abs(hashName(name)) % 8];
  const initials = getInitials(name);

  const circleStyle: React.CSSProperties = {
    width: px,
    height: px,
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(56,182,255,0.35)',
    position: 'relative',
  };

  const tooltipLabel = role ? `${name} — ${role}` : name;

  return (
    <span
      role="img"
      aria-label={tooltipLabel}
      title={tooltipLabel}
      style={circleStyle}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            background: palette.bg,
            color: palette.fg,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: FONT_SIZE[size],
            letterSpacing: '0.03em',
            userSelect: 'none',
          }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}

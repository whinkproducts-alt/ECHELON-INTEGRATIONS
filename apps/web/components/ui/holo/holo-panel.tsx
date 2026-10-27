'use client';
// HoloPanel props: tone?: HoloTone, glow?: 'none'|'soft'|'strong', brackets?: boolean, edge?: boolean (animated edge light, default true)
// interactive?: boolean (hover lift, focusable), as?: 'div'|'section'|'article'|'li', padded?: boolean (default true), className, children
// Also accepts standard div attributes (onClick, role, aria-*). Glass look comes from tokens only.
import * as React from 'react';
import { cn } from '@/lib/utils';
import { toneClass, type HoloTone } from './tone';

export interface HoloPanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  tone?: HoloTone;
  glow?: 'none' | 'soft' | 'strong';
  brackets?: boolean;
  edge?: boolean;
  interactive?: boolean;
  padded?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
  children?: React.ReactNode;
}

export function HoloPanel({
  tone = 'accent', glow = 'none', brackets = false, edge = true, interactive = false,
  padded = true, as = 'div', className, children, tabIndex, ...rest
}: HoloPanelProps) {
  const Tag = as as React.ElementType;
  return (
    <Tag
      data-glow={glow}
      data-interactive={interactive ? 'true' : undefined}
      tabIndex={interactive && tabIndex === undefined ? 0 : tabIndex}
      className={cn('holo-panel', toneClass(tone), padded && 'p-5', className)}
      {...rest}
    >
      {edge && <span className="holo-edge" aria-hidden />}
      {brackets && (['tl', 'tr', 'bl', 'br'] as const).map((p) => <span key={p} data-pos={p} className="holo-bracket" aria-hidden />)}
      <div className="relative z-[3]">{children}</div>
    </Tag>
  );
}

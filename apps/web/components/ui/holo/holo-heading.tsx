'use client';
// HoloHeading props: title: string, eyebrow?: string (small mono label above), description?: ReactNode, actions?: ReactNode (right side)
// level?: 1|2|3 (semantic h-level, default 1), tone?: HoloTone, className
// Title reveals with a one-shot scan-line sweep (disabled for reduced motion).
import * as React from 'react';
import { cn } from '@/lib/utils';
import { toneClass, type HoloTone } from './tone';

export interface HoloHeadingProps {
  title: string;
  eyebrow?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  level?: 1 | 2 | 3;
  tone?: HoloTone;
  className?: string;
}

export function HoloHeading({ title, eyebrow, description, actions, level = 1, tone = 'accent', className }: HoloHeadingProps) {
  const H = `h${level}` as 'h1' | 'h2' | 'h3';
  const size = level === 1 ? 'text-3xl sm:text-4xl' : level === 2 ? 'text-2xl' : 'text-xl';
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', toneClass(tone), className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 font-mono text-[0.6875rem] uppercase tracking-[0.28em]" style={{ color: 'hsl(var(--holo-c))' }}>
            <span className="holo-reveal inline-block">{eyebrow}</span>
          </p>
        )}
        <div className="holo-scanline inline-block max-w-full">
          <H className={cn('holo-reveal holo-text-glow font-display font-semibold tracking-tight text-foreground', size)}>{title}</H>
        </div>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

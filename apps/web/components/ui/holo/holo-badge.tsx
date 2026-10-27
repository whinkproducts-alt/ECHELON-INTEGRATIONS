'use client';
// HoloBadge props: tone?: HoloTone, dot?: boolean, pulse?: boolean, children: text label (required for meaning), className
// StatusDot props: tone?: HoloTone, label: string (read by screen readers; set showLabel to render it), pulse?: boolean, showLabel?: boolean
// Pending approvals: use tone="amber" with a visible text label such as "Awaiting approval". Colour never carries meaning alone.
import * as React from 'react';
import { cn } from '@/lib/utils';
import { toneClass, type HoloTone } from './tone';

export function StatusDot({ tone = 'accent', label, pulse = false, showLabel = false, className }: { tone?: HoloTone; label: string; pulse?: boolean; showLabel?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', toneClass(tone), className)}>
      <span className="holo-dot" data-pulse={pulse ? 'true' : undefined} aria-hidden />
      <span className={showLabel ? 'text-xs text-muted-foreground' : 'sr-only'}>{label}</span>
    </span>
  );
}

export function HoloBadge({ tone = 'accent', dot = false, pulse = false, children, className }: { tone?: HoloTone; dot?: boolean; pulse?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('holo-badge', toneClass(tone), className)}>
      {dot && <span className="holo-dot" data-pulse={pulse ? 'true' : undefined} aria-hidden />}
      {children}
    </span>
  );
}

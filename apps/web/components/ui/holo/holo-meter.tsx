'use client';
// HoloMeter props: value: number, max?: number (default 100), label: string, variant?: 'arc'|'linear' (default 'linear')
// limit?: boolean (amber, for usage limits; shows "LIMIT" text), tone?: HoloTone, valueText?: string (overrides the shown reading), size?: number (arc px, default 120)
// Exposes role="meter" with aria-valuenow/min/max. Amber variant always carries the text label, never colour alone.
import * as React from 'react';
import { cn } from '@/lib/utils';
import { toneClass, type HoloTone } from './tone';

export interface HoloMeterProps {
  value: number;
  max?: number;
  label: string;
  variant?: 'arc' | 'linear';
  limit?: boolean;
  tone?: HoloTone;
  valueText?: string;
  size?: number;
  className?: string;
}

export function HoloMeter({ value, max = 100, label, variant = 'linear', limit = false, tone = 'accent', valueText, size = 120, className }: HoloMeterProps) {
  const t: HoloTone = limit ? 'amber' : tone;
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const reading = valueText ?? `${Math.round(pct * 100)}%`;
  const aria = { role: 'meter', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': Math.min(value, max), 'aria-valuetext': limit ? `${reading}, limit` : reading } as const;

  if (variant === 'arc') {
    const r = 44;
    const c = 2 * Math.PI * r;
    const arc = c * 0.75;
    return (
      <div {...aria} className={cn('relative inline-flex flex-col items-center', toneClass(t), className)} style={{ width: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--holo-c) / 0.14)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${arc} ${c}`} transform="rotate(135 50 50)" />
          <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--holo-c))" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${arc * pct} ${c}`} transform="rotate(135 50 50)" style={{ filter: 'drop-shadow(0 0 6px hsl(var(--holo-c) / 0.8))', transition: 'stroke-dasharray 0.8s cubic-bezier(0.2,0.7,0.2,1)' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pb-3">
          <span className="font-mono text-xl tabular-nums text-foreground">{reading}</span>
          {limit && <span className="font-mono text-[0.625rem] uppercase tracking-widest" style={{ color: 'hsl(var(--holo-c))' }}>Limit</span>}
        </div>
        <span className="-mt-3 text-xs text-muted-foreground">{label}</span>
      </div>
    );
  }

  return (
    <div {...aria} className={cn('w-full', toneClass(t), className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground">
          {reading}
          {limit && <span className="ml-2 uppercase tracking-widest" style={{ color: 'hsl(var(--holo-c))' }}>Limit</span>}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'hsl(var(--holo-c) / 0.14)' }}>
        <div className="h-full origin-left rounded-full" style={{ width: '100%', transform: `scaleX(${pct})`, background: 'hsl(var(--holo-c))', boxShadow: '0 0 10px hsl(var(--holo-c) / 0.8)', transition: 'transform 0.8s cubic-bezier(0.2,0.7,0.2,1)' }} />
      </div>
    </div>
  );
}

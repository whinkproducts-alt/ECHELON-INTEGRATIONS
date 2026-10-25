'use client';
import * as React from 'react';
import Image from 'next/image';
import { logoAspect } from './accent';
import { cn } from '@/lib/utils';

// Logo files carry their own dark or scenic background, so they are framed and cropped, never blended.
export function SubsidiaryLogo({ id, name, src, sizes, className, priority = false }: { id: string; name: string; src: string; sizes: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn('sub-logo relative overflow-hidden rounded-xl', className)} style={{ aspectRatio: logoAspect(id) }}>
      <Image src={src} alt={`${name} logo`} fill sizes={sizes} priority={priority} className="object-cover" />
    </div>
  );
}

export function ProgressRing({ percent, size = 64, label }: { percent: number; size?: number; label: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-valuetext={`${p}%`} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="hsl(var(--sub-c) / 0.18)" strokeWidth="4" />
        <circle cx="24" cy="24" r={r} fill="none" stroke="hsl(var(--sub-c))" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} transform="rotate(-90 24 24)" style={{ filter: 'drop-shadow(0 0 4px hsl(var(--sub-c) / 0.7))' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-xs tabular-nums text-foreground">{p}%</span>
    </div>
  );
}

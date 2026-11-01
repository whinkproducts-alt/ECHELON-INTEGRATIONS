'use client';
// HoloStat props: label: string, value: number, format?: (n:number)=>string (default Intl en-US), prefix?, suffix?, decimals?: number
// sparkline?: number[] (draws a line under the number), delta?: string (text e.g. "+4%"), tone?: HoloTone, duration?: number ms (default 900)
// Count-up runs in rAF after mount; server HTML shows the final value. Reduced motion shows the final value immediately.
import * as React from 'react';
import { cn } from '@/lib/utils';
import { toneClass, type HoloTone } from './tone';
import { HoloPanel } from './holo-panel';

export interface HoloStatProps {
  label: string;
  value: number;
  format?: (n: number) => string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  sparkline?: number[];
  delta?: string;
  tone?: HoloTone;
  duration?: number;
  className?: string;
}

function useCountUp(target: number, duration: number): number {
  const [shown, setShown] = React.useState(target);
  const fromRef = React.useRef(target);
  React.useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    fromRef.current = target;
    if (reduced || from === target) return;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((d, i) => `${((i / (data.length - 1)) * 100).toFixed(2)},${(26 - ((d - min) / span) * 24).toFixed(2)}`);
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={cn('h-7 w-full', className)} aria-hidden>
      <polyline points={`0,28 ${pts.join(' ')} 100,28`} fill="hsl(var(--holo-c) / 0.12)" stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke="hsl(var(--holo-c))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function HoloStat({ label, value, format, prefix, suffix, decimals = 0, sparkline, delta, tone = 'accent', duration = 900, className }: HoloStatProps) {
  const shown = useCountUp(value, duration);
  const text = format
    ? format(shown)
    : new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(shown);
  const finalText = format
    ? format(value)
    : new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return (
    <HoloPanel tone={tone} className={cn(toneClass(tone), className)}>
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 flex items-baseline gap-1 font-mono text-3xl font-medium tabular-nums text-foreground" aria-label={`${label}: ${prefix ?? ''}${finalText}${suffix ?? ''}`}>
        <span aria-hidden>{prefix}{text}{suffix}</span>
        {delta && <span className="ml-2 text-xs text-muted-foreground">{delta}</span>}
      </p>
      {sparkline && <Sparkline data={sparkline} className="mt-3" />}
    </HoloPanel>
  );
}

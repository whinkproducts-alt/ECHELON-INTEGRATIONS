// Hand-built horizontal bar chart. One labelled row per bar: the label and the exact value are real text,
// the bar is a decorative SVG (aria-hidden) so nothing depends on colour or on reading the graphic.
// Colours come from tone tokens (--holo-c); no hex anywhere. No animation.
import * as React from 'react';
import { cn } from '@/lib/utils';
import { toneClass, type HoloTone } from '@/components/ui/holo';

export interface BarItem { key: string; label: string; value: number; valueText: string; note?: string; tone?: HoloTone }

export function BarChart({ title, caption, items, className }: { title: string; caption?: string; items: BarItem[]; className?: string }) {
  const id = React.useId();
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <figure className={cn('space-y-3', className)} aria-labelledby={`${id}-t`}>
      <figcaption>
        <p id={`${id}-t`} className="font-display text-base font-semibold text-foreground">{title}</p>
        {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      </figcaption>
      <ul className="space-y-3">
        {items.map((i) => {
          const pct = max > 0 ? Math.max(0, Math.min(100, (i.value / max) * 100)) : 0;
          return (
            <li key={i.key} className={toneClass(i.tone ?? 'accent')}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                <span className="break-words text-foreground">{i.label}{i.note && <span className="ml-2 text-muted-foreground">{i.note}</span>}</span>
                <span className="whitespace-nowrap font-mono tabular-nums text-foreground">{i.valueText}</span>
              </div>
              <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="block h-2 w-full" aria-hidden focusable="false">
                <rect x="0" y="0" width="100" height="6" rx="3" fill="hsl(var(--holo-c) / 0.14)" />
                {pct > 0 && <rect x="0" y="0" width={Math.max(pct, 1.5)} height="6" rx="3" fill="hsl(var(--holo-c))" />}
              </svg>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

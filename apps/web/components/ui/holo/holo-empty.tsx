'use client';
// HoloEmpty props: state?: 'empty'|'loading'|'error'|'awaiting' (default 'empty'), title: string, description?: ReactNode, icon?: ReactNode, action?: ReactNode
// className. One component covers all four required screen states. 'awaiting' is amber and always shows the text "Awaiting approval";
// 'error' uses the denial token only for security events, so generic errors use the ember tone with an "Error" label.
import * as React from 'react';
import { cn } from '@/lib/utils';
import { toneClass, type HoloTone } from './tone';
import { HoloPanel } from './holo-panel';

const STATE: Record<NonNullable<HoloEmptyProps['state']>, { tone: HoloTone; tag: string }> = {
  empty: { tone: 'accent', tag: 'Empty' },
  loading: { tone: 'accent', tag: 'Loading' },
  error: { tone: 'ember', tag: 'Error' },
  awaiting: { tone: 'amber', tag: 'Awaiting approval' },
};

export interface HoloEmptyProps {
  state?: 'empty' | 'loading' | 'error' | 'awaiting';
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function HoloEmpty({ state = 'empty', title, description, icon, action, className }: HoloEmptyProps) {
  const s = STATE[state];
  return (
    <HoloPanel tone={s.tone} brackets glow={state === 'awaiting' ? 'soft' : 'none'} className={cn('mx-auto w-full max-w-xl text-center', className)}
      role={state === 'error' ? 'alert' : 'status'} aria-live="polite" aria-busy={state === 'loading' || undefined}>
      <div className={cn('flex flex-col items-center gap-3 py-6', toneClass(s.tone))}>
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full" style={{ color: 'hsl(var(--holo-c))', background: 'hsl(var(--holo-c) / 0.1)', border: '1px solid hsl(var(--holo-c) / 0.4)' }}>
          {state === 'loading' ? <span className="holo-spinner h-6 w-6" aria-hidden /> : (icon ?? <span className="holo-dot" data-pulse="true" aria-hidden />)}
        </div>
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.25em]" style={{ color: 'hsl(var(--holo-c))' }}>{s.tag}</span>
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </HoloPanel>
  );
}

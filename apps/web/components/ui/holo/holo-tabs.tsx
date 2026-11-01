'use client';
// HoloTabs props: tabs: {id:string,label:string,badge?:ReactNode,content?:ReactNode,disabled?:boolean}[], value?: string (controlled), defaultValue?: string
// onValueChange?: (id)=>void, ariaLabel?: string, className. Renders the active tab's content below. Arrow keys, Home and End move focus.
// The active indicator grows in with a CSS transform animation (no framer-motion: its layout feature is broken in the installed build).
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface HoloTab { id: string; label: string; badge?: React.ReactNode; content?: React.ReactNode; disabled?: boolean }

export interface HoloTabsProps {
  tabs: HoloTab[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function HoloTabs({ tabs, value, defaultValue, onValueChange, ariaLabel = 'Sections', className }: HoloTabsProps) {
  const uid = React.useId();
  const [inner, setInner] = React.useState(defaultValue ?? tabs[0]?.id ?? '');
  const active = value ?? inner;
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const select = (id: string) => { if (value === undefined) setInner(id); onValueChange?.(id); };
  const enabled = tabs.filter((t) => !t.disabled);
  const onKey = (e: React.KeyboardEvent) => {
    const i = enabled.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const t = enabled[next];
    select(t.id);
    refs.current[t.id]?.focus();
  };
  const current = tabs.find((t) => t.id === active);
  return (
    <div className={className}>
      <div role="tablist" aria-label={ariaLabel} onKeyDown={onKey} className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'hsl(var(--border))' }}>
        {tabs.map((t) => (
          <button
            key={t.id} ref={(el) => { refs.current[t.id] = el; }} role="tab" type="button" id={`${uid}-tab-${t.id}`}
            aria-selected={active === t.id} aria-controls={`${uid}-panel-${t.id}`} tabIndex={active === t.id ? 0 : -1}
            disabled={t.disabled} onClick={() => select(t.id)} className={cn('holo-tab whitespace-nowrap disabled:opacity-40')}
          >
            <span className="inline-flex items-center gap-2">{t.label}{t.badge}</span>
            {active === t.id && <span className="holo-tab-indicator" aria-hidden />}
          </button>
        ))}
      </div>
      {current?.content !== undefined && (
        <div role="tabpanel" id={`${uid}-panel-${current.id}`} aria-labelledby={`${uid}-tab-${current.id}`} tabIndex={0} className="pt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {current.content}
        </div>
      )}
    </div>
  );
}

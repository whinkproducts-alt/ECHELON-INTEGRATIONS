'use client';
// Small shared controls for the operations screens: filter select, date field, copy button, status chip.
// Colours come from design tokens through the HOLO primitives. Every chip carries a text label.
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { HoloBadge, type HoloTone } from '@/components/ui/holo';
import { humanize } from './format';

export const FIELD_CLASS =
  'w-full rounded-md border border-border bg-[hsl(var(--base)/0.6)] px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export interface FilterOption { value: string; label: string; count?: number }

export function FilterSelect({ label, value, onChange, options, allLabel = 'All' }: {
  label: string; value: string; onChange: (v: string) => void; options: FilterOption[]; allLabel?: string;
}) {
  const id = React.useId();
  // Keep a selected value visible even if the facet list does not contain it (for example from a URL).
  const list = value && !options.some((o) => o.value === value) ? [{ value, label: value }, ...options] : options;
  return (
    <div className="min-w-[9rem] flex-1">
      <label htmlFor={id} className="mb-1 block font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_CLASS}>
        <option value="">{allLabel}</option>
        {list.map((o) => (
          <option key={o.value} value={o.value}>{o.label}{o.count !== undefined ? ` (${o.count.toLocaleString('en-US')})` : ''}</option>
        ))}
      </select>
    </div>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = React.useId();
  return (
    <div className="min-w-[9rem] flex-1">
      <label htmlFor={id} className="mb-1 block font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">{label}</label>
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_CLASS} />
    </div>
  );
}

/** Copies a value to the clipboard and says so. The value itself is never shown by this control. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = React.useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = () => {
    const p = typeof navigator !== 'undefined' && navigator.clipboard ? navigator.clipboard.writeText(value) : Promise.reject(new Error('no clipboard'));
    p.then(() => setDone('copied')).catch(() => setDone('failed'));
    setTimeout(() => setDone('idle'), 1800);
  };
  return (
    <>
      <button type="button" onClick={copy} aria-label={label} title={label}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {done === 'copied' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{done === 'copied' ? 'Copied' : done === 'failed' ? 'Copy failed' : ''}</span>
    </>
  );
}

const STATUS: Record<string, { tone: HoloTone; label: string }> = {
  AWAITING_APPROVAL: { tone: 'amber', label: 'Awaiting approval' },
  PENDING: { tone: 'amber', label: 'Awaiting approval' },
  APPROVED: { tone: 'accent', label: 'Approved' },
  EXECUTED: { tone: 'accent', label: 'Ran' },
  DENIED: { tone: 'neutral', label: 'Denied' },
  EXPIRED: { tone: 'neutral', label: 'Expired' },
  FAILED: { tone: 'ember', label: 'Failed' },
};

/** Status chip. Amber is used only for a request still waiting on a human. */
export function StatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? { tone: 'neutral' as HoloTone, label: humanize(status) };
  return <HoloBadge tone={s.tone} dot={s.tone === 'amber'} pulse={s.tone === 'amber'}>{s.label}</HoloBadge>;
}

export function ProtectedChip({ category }: { category: 'money' | 'proprietary' | string | null }) {
  if (category !== 'money' && category !== 'proprietary') return null;
  return <HoloBadge tone="amber">{category === 'money' ? 'Protected: money' : 'Protected: proprietary information'}</HoloBadge>;
}

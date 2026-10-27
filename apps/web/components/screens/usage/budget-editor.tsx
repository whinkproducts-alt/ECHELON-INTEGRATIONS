'use client';
// Budget editor. Validates on the client for fast feedback; the server validates again and wins.
import * as React from 'react';
import { HoloButton, HoloPanel, HoloHeading, StatusDot } from '@/components/ui/holo';

export interface BudgetValues { limit: number | null; softPct: number; hardPct: number }

const MAX_TOKENS = 10_000_000_000;

function parseIntStrict(v: string): number | null {
  return /^\d{1,11}$/.test(v.trim()) ? Number(v.trim()) : null;
}

export function BudgetEditor({ initial, onSaved }: { initial: BudgetValues; onSaved: () => void }) {
  const [limit, setLimit] = React.useState(String(initial.limit ?? 0));
  const [soft, setSoft] = React.useState(String(initial.softPct));
  const [hard, setHard] = React.useState(String(initial.hardPct));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const l = parseIntStrict(limit);
  const s = parseIntStrict(soft);
  const h = parseIntStrict(hard);
  const errors: Partial<Record<'limit' | 'soft' | 'hard', string>> = {};
  if (l === null || l > MAX_TOKENS) errors.limit = 'Whole number from 0 to 10,000,000,000. Use 0 for no limit.';
  if (s === null || s < 1 || s > 100) errors.soft = 'Whole number from 1 to 100.';
  if (h === null || h < 1 || h > 200) errors.hard = 'Whole number from 1 to 200.';
  if (!errors.soft && !errors.hard && s! > h!) errors.soft = 'The soft threshold cannot be higher than the hard one.';
  const valid = Object.keys(errors).length === 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/usage/budget', { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ monthlyTokenBudget: l, softPct: s, hardPct: h }) });
      if (res.ok) { setMsg({ kind: 'ok', text: 'Budget saved.' }); onSaved(); }
      else if (res.status === 403) setMsg({ kind: 'error', text: 'The permission engine refused this change. Nothing was saved.' });
      else if (res.status === 400) setMsg({ kind: 'error', text: 'The server rejected those values. Check the limits and try again.' });
      else if (res.status === 401) setMsg({ kind: 'error', text: 'Your session has ended. Sign in again.' });
      else setMsg({ kind: 'error', text: `Could not save (${res.status}). Nothing changed.` });
    } catch {
      setMsg({ kind: 'error', text: 'The request did not reach the server.' });
    } finally {
      setBusy(false);
    }
  };

  const field = (id: 'limit' | 'soft' | 'hard', label: string, value: string, set: (v: string) => void, hint: string) => (
    <div>
      <label htmlFor={`budget-${id}`} className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">{label}</label>
      <input
        id={`budget-${id}`} inputMode="numeric" autoComplete="off" value={value} onChange={(e) => { set(e.target.value); setMsg(null); }}
        aria-invalid={errors[id] ? true : undefined} aria-describedby={`budget-${id}-help`}
        className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 font-mono text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p id={`budget-${id}-help`} className="mt-1 text-xs text-muted-foreground">{errors[id] ?? hint}</p>
    </div>
  );

  return (
    <section aria-label="Budget editor" className="space-y-4">
      <HoloHeading level={2} eyebrow="Limits" title="Budget" description="A monthly token allowance for your account. Thresholds are percentages of it." tone="deep" />
      <HoloPanel tone="deep">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-3" noValidate>
          {field('limit', 'Monthly tokens', limit, setLimit, '0 means no limit.')}
          {field('soft', 'Soft limit %', soft, setSoft, 'You are warned here.')}
          {field('hard', 'Hard limit %', hard, setHard, 'The budget counts as reached here.')}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <HoloButton type="submit" size="sm" loading={busy} disabled={!valid}>Save budget</HoloButton>
            <div aria-live="polite" className="min-h-5 text-sm">
              {msg && (
                <span className="inline-flex items-center gap-2" role={msg.kind === 'error' ? 'alert' : 'status'}>
                  <StatusDot tone={msg.kind === 'ok' ? 'accent' : 'ember'} label={msg.kind === 'ok' ? 'Saved' : 'Error'} showLabel />
                  <span className="text-foreground">{msg.text}</span>
                </span>
              )}
            </div>
          </div>
        </form>
      </HoloPanel>
    </section>
  );
}

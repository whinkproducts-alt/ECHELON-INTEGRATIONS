'use client';
// ConvenePanel: schedule a board meeting (POST /api/board/meetings) and list upcoming and past meetings (GET).
// Dates are formatted only after the client has fetched, so nothing time dependent renders on the server.
import * as React from 'react';
import { CalendarPlus, Plus, X } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloPanel } from '@/components/ui/holo';
import type { BoardMember } from '@/lib/board';
import type { BoardMeetingView } from './types';

export type MeetingsState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; meetings: BoardMeetingView[] };

const field = 'w-full rounded-md border border-border bg-[hsl(var(--base)/0.6)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function ConvenePanel({ members, state, selectedId, onSelect, onCreated, onRetry }: {
  members: BoardMember[];
  state: MeetingsState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (m: BoardMeetingView) => void;
  onRetry: () => void;
}) {
  const [title, setTitle] = React.useState('');
  const [when, setWhen] = React.useState('');
  const [agenda, setAgenda] = React.useState<string[]>([]);
  const [item, setItem] = React.useState('');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const addItem = () => {
    const v = item.trim();
    if (!v || agenda.length >= 50) return;
    setAgenda((a) => [...a, v.slice(0, 300)]);
    setItem('');
  };
  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const date = new Date(when);
    if (!title.trim() || Number.isNaN(date.getTime())) { setError('Add a title and a valid date and time.'); return; }
    setSaving(true);
    setError(null);
    fetch('/api/board/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), scheduledFor: date.toISOString(), agenda, attendees: picked }),
    })
      .then((r) => r.json().then((d: { meeting?: BoardMeetingView; error?: string }) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        setSaving(false);
        if (!ok || !d.meeting) { setError(d.error ?? 'Could not schedule the meeting. Try again.'); return; }
        onCreated(d.meeting);
        setTitle(''); setWhen(''); setAgenda([]); setPicked([]);
      })
      .catch(() => { setSaving(false); setError('Could not reach the server. Try again.'); });
  };

  const meetings = state.kind === 'ready' ? state.meetings : [];
  const upcoming = meetings.filter((m) => m.status === 'SCHEDULED').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const past = meetings.filter((m) => m.status !== 'SCHEDULED');

  const row = (m: BoardMeetingView) => (
    <li key={m.id}>
      <button type="button" onClick={() => onSelect(m.id)} aria-pressed={selectedId === m.id}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-[hsl(var(--whink-accent)/0.08)]">
        <span className="min-w-0">
          <span className="block truncate font-display text-sm font-semibold text-foreground">{m.title}</span>
          <span className="block font-mono text-[0.6875rem] text-muted-foreground">{formatWhen(m.scheduledFor)}</span>
        </span>
        <HoloBadge tone={m.status === 'SCHEDULED' ? 'accent' : 'neutral'}>{m.status === 'SCHEDULED' ? 'Scheduled' : m.status === 'HELD' ? 'Held' : 'Cancelled'}</HoloBadge>
      </button>
    </li>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <HoloPanel as="section" brackets aria-labelledby="convene-title">
        <h2 id="convene-title" className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-foreground"><CalendarPlus className="h-5 w-5 text-primary" aria-hidden />Convene a meeting</h2>
        <form onSubmit={submit} className="space-y-4" aria-busy={saving}>
          <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Title</span>
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="Quarterly review" />
          </label>
          <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Date and time</span>
            <input className={field} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </label>
          <div className="text-sm">
            <label htmlFor="agenda-item" className="mb-1 block text-muted-foreground">Agenda items</label>
            <div className="flex gap-2">
              <input id="agenda-item" className={field} value={item} maxLength={300} placeholder="Add an item" onChange={(e) => setItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
              <HoloButton variant="ghost" onClick={addItem} aria-label="Add agenda item" leftIcon={<Plus className="h-4 w-4" aria-hidden />}>Add</HoloButton>
            </div>
            {agenda.length > 0 && (
              <ol className="mt-2 space-y-1">
                {agenda.map((a, i) => (
                  <li key={`${i}-${a}`} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-xs">
                    <span className="min-w-0 break-words"><span className="mr-2 font-mono text-muted-foreground">{i + 1}.</span>{a}</span>
                    <button type="button" onClick={() => setAgenda((l) => l.filter((_, j) => j !== i))} aria-label={`Remove agenda item ${i + 1}`} className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="h-3.5 w-3.5" aria-hidden /></button>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <fieldset className="text-sm">
            <legend className="mb-1 text-muted-foreground">Attendees</legend>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <label key={m.id} className="cursor-pointer">
                  <input type="checkbox" className="peer sr-only" checked={picked.includes(m.name)} onChange={() => toggle(m.name)} />
                  <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors peer-checked:border-primary peer-checked:bg-[hsl(var(--whink-accent)/0.12)] peer-checked:text-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-ring">
                    {picked.includes(m.name) ? '✓ ' : ''}{m.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-[hsl(var(--ember))]"><span className="font-mono text-xs uppercase tracking-wider">Error: </span>{error}</p>}
          <HoloButton type="submit" loading={saving} size="lg">Schedule meeting</HoloButton>
        </form>
      </HoloPanel>

      <section aria-labelledby="meetings-title" className="space-y-4">
        <h2 id="meetings-title" className="font-display text-xl font-semibold text-foreground">Meetings</h2>
        {state.kind === 'loading' && <HoloEmpty state="loading" title="Loading meetings" />}
        {state.kind === 'error' && <HoloEmpty state="error" title="Meetings could not be loaded" description={state.message} action={<HoloButton variant="ghost" onClick={onRetry}>Retry</HoloButton>} />}
        {state.kind === 'ready' && meetings.length === 0 && <HoloEmpty title="No meetings yet" description="Schedule the first board meeting with the form." />}
        {state.kind === 'ready' && meetings.length > 0 && (
          <>
            <div><h3 className="mb-2 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Upcoming</h3>
              {upcoming.length ? <ul className="space-y-2">{upcoming.map(row)}</ul> : <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}</div>
            <div><h3 className="mb-2 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Past</h3>
              {past.length ? <ul className="space-y-2">{past.map(row)}</ul> : <p className="text-sm text-muted-foreground">No past meetings.</p>}</div>
          </>
        )}
      </section>
    </div>
  );
}

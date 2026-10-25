'use client';
// MeetingRoom: round-table view. Attendee portraits sit around the table; the tenant's primary persona facilitates in the centre.
// Seat positions are computed from the index and rounded, so server and client render the same markup.
// Minutes are untrusted free text: they live in a textarea and are only ever rendered as text, never as HTML.
// The agenda checklist is a local aid for the session and is not stored.
import * as React from 'react';
import Image from 'next/image';
import { Save } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloPanel } from '@/components/ui/holo';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import type { BoardMember } from '@/lib/board';
import type { BoardMeetingView } from './types';
import { formatWhen } from './convene-panel';

const MINUTES_MAX = 50_000;

function seat(i: number, n: number) {
  const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
  return { left: `${(50 + 41 * Math.cos(a)).toFixed(2)}%`, top: `${(50 + 38 * Math.sin(a)).toFixed(2)}%` };
}

export function MeetingRoom({ meeting, members, onSaved }: { meeting: BoardMeetingView | null; members: BoardMember[]; onSaved: (m: BoardMeetingView) => void }) {
  if (!meeting) {
    return <HoloEmpty title="No meeting selected" description="Pick a meeting from the Convene tab to open its room." />;
  }
  return <Room key={meeting.id} meeting={meeting} members={members} onSaved={onSaved} />;
}

function Room({ meeting, members, onSaved }: { meeting: BoardMeetingView; members: BoardMember[]; onSaved: (m: BoardMeetingView) => void }) {
  const { productName } = useTenantConfig();
  const [done, setDone] = React.useState<boolean[]>(() => meeting.agenda.map(() => false));
  const [minutes, setMinutes] = React.useState(meeting.minutes ?? '');
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<{ kind: 'idle' | 'saved' | 'error'; message?: string }>({ kind: 'idle' });

  const seated = meeting.attendees.map((name) => ({ name, member: members.find((m) => m.name === name) }));

  const save = () => {
    if (saving || !minutes.trim()) return;
    setSaving(true);
    setStatus({ kind: 'idle' });
    fetch(`/api/board/meetings/${encodeURIComponent(meeting.id)}/minutes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes }),
    })
      .then((r) => r.json().then((d: { meeting?: BoardMeetingView; error?: string }) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        setSaving(false);
        if (!ok || !d.meeting) { setStatus({ kind: 'error', message: d.error ?? 'Minutes were not saved.' }); return; }
        onSaved(d.meeting);
        setStatus({ kind: 'saved' });
      })
      .catch(() => { setSaving(false); setStatus({ kind: 'error', message: 'Could not reach the server.' }); });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-foreground">{meeting.title}</h2>
          <p className="font-mono text-xs text-muted-foreground">{formatWhen(meeting.scheduledFor)}</p>
        </div>
        <HoloBadge tone={meeting.status === 'SCHEDULED' ? 'accent' : 'neutral'} dot>{meeting.status === 'SCHEDULED' ? 'Scheduled' : meeting.status === 'HELD' ? 'Held' : 'Cancelled'}</HoloBadge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <HoloPanel as="section" glow="soft" aria-label="Round table">
          <div className="relative mx-auto aspect-square w-full max-w-xl">
            <div className="absolute inset-[22%] rounded-full border border-[hsl(var(--whink-accent)/0.4)] bg-[radial-gradient(circle,hsl(var(--deep)/0.45),hsl(var(--base)/0.2))] shadow-[0_0_60px_-10px_hsl(var(--whink-accent)/0.5)]" aria-hidden />
            <div className="absolute left-1/2 top-1/2 flex w-[30%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center">
              <span className="relative block aspect-square w-full overflow-hidden rounded-full border border-primary shadow-[0_0_30px_hsl(var(--whink-accent)/0.6)]">
                <Image src="/board/whink.webp" alt={`${productName} facilitating`} fill sizes="10rem" className="object-cover object-top" />
              </span>
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-primary">{productName}</span>
              <span className="text-[0.625rem] text-muted-foreground">Facilitating</span>
            </div>
            {seated.length === 0 && <p className="absolute inset-x-0 bottom-[8%] text-center text-xs text-muted-foreground">No attendees were invited.</p>}
            <ul className="absolute inset-0">
              {seated.map((s, i) => (
                <li key={`${s.name}-${i}`} className="absolute flex w-[22%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center" style={seat(i, seated.length)}>
                  <span className="relative block aspect-square w-[78%] overflow-hidden rounded-full border border-border bg-[hsl(var(--surface))]">
                    {s.member?.imageUrl
                      ? <Image src={s.member.imageUrl} alt="" fill sizes="6rem" className="object-cover object-top" />
                      : <span className="flex h-full items-center justify-center font-display text-lg text-muted-foreground" aria-hidden>{s.name.slice(0, 1)}</span>}
                  </span>
                  <span className="text-[0.6875rem] font-medium leading-tight text-foreground">{s.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </HoloPanel>

        <div className="space-y-6">
          <HoloPanel as="section" aria-labelledby="agenda-title">
            <h3 id="agenda-title" className="mb-3 font-display text-lg font-semibold text-foreground">Agenda</h3>
            {meeting.agenda.length === 0 ? <p className="text-sm text-muted-foreground">No agenda items were set.</p> : (
              <ul className="space-y-2">
                {meeting.agenda.map((a, i) => (
                  <li key={`${i}-${a}`}>
                    <label className="flex cursor-pointer items-start gap-3 text-sm">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--whink-accent))]" checked={done[i] ?? false} onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))} />
                      <span className={done[i] ? 'text-muted-foreground line-through' : 'text-foreground'}>{a}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </HoloPanel>

          <HoloPanel as="section" aria-labelledby="minutes-title">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id="minutes-title" className="font-display text-lg font-semibold text-foreground">Minutes</h3>
              <HoloBadge tone="neutral">Plain text only</HoloBadge>
            </div>
            <textarea value={minutes} onChange={(e) => { setMinutes(e.target.value); setStatus({ kind: 'idle' }); }} maxLength={MINUTES_MAX} rows={9}
              aria-label="Meeting minutes" placeholder="Record decisions and actions."
              className="w-full resize-y rounded-md border border-border bg-[hsl(var(--base)/0.6)] p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <HoloButton onClick={save} loading={saving} disabled={!minutes.trim()} leftIcon={<Save className="h-4 w-4" aria-hidden />}>Save minutes</HoloButton>
              <span className="font-mono text-[0.6875rem] text-muted-foreground">{minutes.length.toLocaleString('en-US')} / {MINUTES_MAX.toLocaleString('en-US')}</span>
              <span role="status" aria-live="polite" className="text-xs">
                {status.kind === 'saved' && <span className="text-primary">Saved</span>}
                {status.kind === 'error' && <span className="text-[hsl(var(--ember))]">Error: {status.message}</span>}
              </span>
            </div>
            {meeting.minutesAt && <p className="mt-2 font-mono text-[0.6875rem] text-muted-foreground">Last saved {formatWhen(meeting.minutesAt)}</p>}
          </HoloPanel>
        </div>
      </div>
    </div>
  );
}

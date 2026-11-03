'use client';
// R07 lockdown section and R06 channel readiness. Channel rows show credential presence only, never values,
// and say plainly that configured is not the same as verified.
import { useEffect, useState } from 'react';
import { useSafety } from '@/components/safety/lockdown-control';

type Channels = Record<string, { configured: boolean; note: string }>;
const LABEL: Record<string, string> = { EMAIL: 'Email', SMS: 'SMS', WHATSAPP: 'WhatsApp', TELEGRAM: 'Telegram', PHONE_CALL: 'Phone call', IMESSAGE: 'iMessage' };

export function SafetyPanel() {
  const { load, busy, error, engage } = useSafety();
  const [reason, setReason] = useState('');
  const locked = load.kind === 'ready' && load.state.lockedDown;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Lockdown stops new jobs, outbound tools and messages, cloud models, microphone and camera at once. Review screens and the ledger stay available. A message or call already sent cannot be recalled.</p>
      {locked ? (
        <p role="status" className="text-sm text-[hsl(var(--denial))]">Lockdown is active. Release it from the banner at the top of the screen.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">Reason (optional)
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="mt-1 block w-64 rounded-md border border-border bg-secondary px-2 py-2 text-sm text-foreground" />
          </label>
          <button type="button" disabled={busy || load.kind !== 'ready'} onClick={() => void engage(reason.trim() || undefined)} className="rounded-md bg-[hsl(var(--denial))] px-4 py-2 text-sm text-white disabled:opacity-50">Engage lockdown</button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-[hsl(var(--denial))]">Error: {error}</p>}
    </div>
  );
}

export function ChannelsPanel() {
  const [data, setData] = useState<{ channels: Channels; blockedBy: string | null } | 'forbidden' | 'error' | null>(null);
  useEffect(() => {
    fetch('/api/comms/channels', { cache: 'no-store' })
      .then(async (r) => (r.status === 403 ? 'forbidden' : r.ok ? await r.json() : 'error'))
      .then(setData)
      .catch(() => setData('error'));
  }, []);
  if (data === null) return <p role="status" className="text-sm text-muted-foreground">Loading channels…</p>;
  if (data === 'forbidden') return <p className="text-sm text-muted-foreground">Channel configuration is visible to owner accounts.</p>;
  if (data === 'error') return <p role="alert" className="text-sm text-[hsl(var(--denial))]">Error: channel status did not load.</p>;
  return (
    <div className="space-y-2">
      {data.blockedBy && <p className="text-xs text-[hsl(var(--pending-amber))]">All channels are stopped by {data.blockedBy === 'lockdown' ? 'lockdown' : 'Local-Only mode'}.</p>}
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {Object.entries(data.channels).map(([k, v]) => (
          <li key={k} className="flex items-baseline gap-2">
            <span className={`font-mono text-xs uppercase ${v.configured ? 'text-primary' : 'text-muted-foreground'}`}>{v.configured ? 'Configured' : 'Unavailable'}</span>
            <span className="text-foreground">{LABEL[k] ?? k}</span>
            <span className="text-xs text-muted-foreground">{v.note}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Configured means credentials are present. A channel counts as working only after an approved live test to a destination you chose.</p>
    </div>
  );
}

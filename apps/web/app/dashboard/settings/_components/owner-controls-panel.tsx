'use client';
// Item 69. Approve a pairing code, edit the read-only command allow-list, read the sandbox explanation. Owner accounts only.
import { useCallback, useEffect, useState } from 'react';
import { approvePairingAction, loadOwnerControls, revokePairingAction, saveAllowListAction } from './owner-controls-actions';

type Data = Awaited<ReturnType<typeof loadOwnerControls>>;
const input = 'mt-1 block rounded-md border border-border bg-secondary px-2 py-2 text-sm text-foreground';
const btn = 'min-h-10 rounded-md border border-border px-3 py-2 text-sm text-foreground disabled:opacity-50';

export function OwnerControlsPanel() {
  const [data, setData] = useState<Data | 'forbidden' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [channel, setChannel] = useState('');
  const [code, setCode] = useState('');
  const [programs, setPrograms] = useState('');
  const load = useCallback(() => loadOwnerControls().then((d) => { setData(d); setPrograms(d.allowList.join(', ')); }).catch(() => setData('forbidden')), []);
  useEffect(() => { void load(); }, [load]);

  if (data === null) return <p role="status" className="text-sm text-muted-foreground">Loading…</p>;
  if (data === 'forbidden') return <p className="text-sm text-muted-foreground">These controls are visible to owner accounts.</p>;
  const say = (ok: boolean, text: string) => setMsg({ ok, text });

  return (
    <div className="space-y-6">
      <section aria-labelledby="pair-h" className="space-y-2">
        <h3 id="pair-h" className="text-sm font-medium">Approve a sender</h3>
        <p className="text-xs text-muted-foreground">An unknown sender gets no reply until you enter the 6-digit code shown to you. A pairing only lets WHINK answer them; every send still needs its own permission.</p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await approvePairingAction(channel.trim(), code.trim()); say(r.ok, r.ok ? 'Sender paired.' : 'Code not recognised or expired.'); if (r.ok) { setCode(''); void load(); } }}>
          <label className="text-xs text-muted-foreground">Channel<input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="telegram" required maxLength={32} className={`${input} w-36`} /></label>
          <label className="text-xs text-muted-foreground">Code<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" pattern="\d{6}" required maxLength={6} autoComplete="off" className={`${input} w-28 font-mono`} /></label>
          <button type="submit" className={btn}>Approve</button>
        </form>
        {data.pairings.length === 0 ? <p className="text-xs text-muted-foreground">No pending or paired senders.</p> : (
          <ul className="space-y-1 text-sm">
            {data.pairings.map((p) => (
              <li key={`${p.channel}:${p.senderId}`} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs uppercase text-muted-foreground">{p.status === 'PAIRED' ? 'Paired' : 'Waiting'}</span>
                <span>{p.channel}: {p.senderId}</span>
                <button type="button" className={btn} aria-label={`Revoke ${p.senderId} on ${p.channel}`} onClick={async () => { await revokePairingAction(p.channel, p.senderId); say(true, 'Revoked.'); void load(); }}>Revoke</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="allow-h" className="space-y-2">
        <h3 id="allow-h" className="text-sm font-medium">Read-only command allow-list</h3>
        <p className="text-xs text-muted-foreground">Programs listed here run as Class B when given plain arguments. Everything else always waits for your approval. Empty by default. Names only, separated by commas or spaces.</p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await saveAllowListAction(programs); say(r.ok, r.ok ? 'Allow-list saved.' : r.error); if (r.ok) void load(); }}>
          <label className="text-xs text-muted-foreground">Programs<input value={programs} onChange={(e) => setPrograms(e.target.value)} placeholder="ls, cat, head" className={`${input} w-72 max-w-full font-mono`} /></label>
          <button type="submit" className={btn}>Save</button>
        </form>
      </section>

      <section aria-labelledby="sbx-h" className="space-y-2">
        <h3 id="sbx-h" className="text-sm font-medium">How commands are sandboxed</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{data.sandbox.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-primary' : 'text-[hsl(var(--denial))]'}`}>{msg.text}</p>}
    </div>
  );
}

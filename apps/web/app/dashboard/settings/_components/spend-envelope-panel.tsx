'use client';
// R15: daily and monthly model-spend caps in CAD, plus the CAD per USD rate. Raising or switching on needs approval of these exact figures.
import { useEffect, useState } from 'react';

interface Env { enabled: boolean; dailyCad: number; monthlyCad: number; cadPerUsd: number }
const box = 'mt-1 block w-32 rounded-md border border-border bg-background px-2 py-1 text-sm';

export function SpendEnvelopePanel() {
  const [env, setEnv] = useState<Env | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'wait' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/settings/spend-envelope', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setEnv).catch(() => setEnv(null));
  }, []);

  if (!env) return <p role="status" className="text-sm text-muted-foreground">Loading spending limits…</p>;

  async function save() {
    if (!env) return;
    setBusy(true); setMsg(null);
    const res = await fetch('/api/settings/spend-envelope', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env) }).catch(() => null);
    setBusy(false);
    if (!res) return setMsg({ kind: 'err', text: 'Could not reach the server.' });
    if (res.status === 202) return setMsg({ kind: 'wait', text: 'Approve these exact figures within 30 seconds on the Approvals screen. Nothing changes until you do.' });
    if (res.ok) return setMsg({ kind: 'ok', text: 'Saved.' });
    setMsg({ kind: 'err', text: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Not saved.' });
  }
  const num = (k: 'dailyCad' | 'monthlyCad' | 'cadPerUsd') => (e: React.ChangeEvent<HTMLInputElement>) => setEnv({ ...env, [k]: Number(e.target.value) });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Limits for paid model calls only. They never cover transfers, purchases or trades, which always need your approval. Lowering a limit or switching off applies at once; raising one or switching on asks you to approve the figures.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Daily limit (CAD)
          <input type="number" min="0" step="0.5" value={env.dailyCad} onChange={num('dailyCad')} className={box} />
        </label>
        <label className="text-xs text-muted-foreground">Monthly limit (CAD)
          <input type="number" min="0" step="1" value={env.monthlyCad} onChange={num('monthlyCad')} className={box} />
        </label>
        <label className="text-xs text-muted-foreground">CAD per 1 USD
          <input type="number" min="0.5" max="5" step="0.01" value={env.cadPerUsd} onChange={num('cadPerUsd')} className={box} />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={env.enabled} onChange={(e) => setEnv({ ...env, enabled: e.target.checked })} /> Allow paid models within these limits</label>
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save limits'}</button>
      </div>
      <p className="text-xs text-muted-foreground">The rate converts your CAD limits to the USD that providers bill in. Set it to your card or bank rate.</p>
      {msg && <p role={msg.kind === 'err' ? 'alert' : 'status'} className={msg.kind === 'err' ? 'text-xs text-[hsl(var(--denial))]' : 'text-xs text-muted-foreground'}>{msg.text}</p>}
    </div>
  );
}

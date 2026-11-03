'use client';
// R04 model priority. First, second and third choice from the registry, saved as named profiles; one is active.
// Shows, for a private chat right now, which choice would be used and why the others are skipped. Choosing a paid or
// trial model here admits no spend and no trial traffic: those gates stay on the server.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface Entry {
  id: string; label: string; provider: string; model: string; kind: 'api' | 'manual_handoff'; local: boolean;
  cost: 'local' | 'trial' | 'metered' | 'manual'; dataCeiling: string; admitted: boolean; handoffUrl: string | null; note: string; configured: boolean;
}
interface Profile { id: string; name: string; choices: string[]; revision: number; active: boolean }
interface Preview { profileId: string | null; steps: Array<{ type: 'auto' | 'handoff'; id: string }>; skipped: Array<{ id: string; reason: string }>; lockedDown: boolean; localOnly: boolean; paidModelsAdmitted: boolean }
type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; registry: Entry[]; profiles: Profile[]; preview: Preview };

const REASON: Record<string, string> = {
  lockdown: 'stopped by lockdown', local_only: 'Local-Only mode', data_class: 'not allowed for private data',
  tools_unsupported: 'no tool support', trial_evaluation_only: 'trial: evaluation only', paid_not_admitted: 'paid models not admitted',
  not_configured: 'no credential on the server', cooldown: 'cooling down after errors', credential_rejected: 'credential rejected',
  unknown_entry: 'no longer available',
};
const COST: Record<Entry['cost'], string> = { local: 'Local', trial: 'Trial', metered: 'Paid', manual: 'Manual' };
const ORDINAL = ['First choice', 'Second choice', 'Third choice'];

export function ModelPriorityPanel() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [name, setName] = useState('Default');
  const [choices, setChoices] = useState<string[]>(['local-default', '', '']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    fetch('/api/models/registry', { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error('Model settings did not load.'); return r.json() as Promise<{ registry: Entry[]; profiles: Profile[]; preview: Preview }>; })
      .then((d) => {
        if (!live) return;
        setLoad({ kind: 'ready', ...d });
        const active = d.profiles.find((p) => p.active);
        if (active) { setName(active.name); setChoices([...active.choices, '', '', ''].slice(0, 3)); }
      })
      .catch((e: unknown) => { if (live) setLoad({ kind: 'error', message: e instanceof Error ? e.message : 'Model settings did not load.' }); });
    return () => { live = false; };
  }, [reload]);

  const picked = choices.filter(Boolean);
  const duplicate = new Set(picked).size !== picked.length;
  const byId = useMemo(() => new Map(load.kind === 'ready' ? load.registry.map((e) => [e.id, e]) : []), [load]);

  const save = async (activate: boolean) => {
    if (duplicate || picked.length === 0) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/models/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), choices: picked, activate }) });
      const d = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) setMsg({ tone: 'error', text: d.error ?? 'Not saved.' });
      else { setMsg({ tone: 'ok', text: activate ? 'Saved and active.' : 'Saved.' }); refresh(); }
    } finally { setBusy(false); }
  };
  const activate = async (id: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/models/profiles/${encodeURIComponent(id)}`, { method: 'POST' });
      if (!r.ok) setMsg({ tone: 'error', text: 'Could not switch profile.' }); else refresh();
    } finally { setBusy(false); }
  };

  if (load.kind === 'loading') return <p role="status" className="text-sm text-muted-foreground">Loading model settings…</p>;
  if (load.kind === 'error') return <p role="alert" className="text-sm text-[hsl(var(--denial))]">Error: {load.message} <button type="button" className="underline" onClick={refresh}>Retry</button></p>;

  const { registry, profiles, preview } = load;
  const handoff = picked.map((id) => byId.get(id)).find((e) => e?.kind === 'manual_handoff');

  return (
    <div className="space-y-4" data-testid="model-priority">
      <div className="grid gap-3 sm:grid-cols-3">
        {ORDINAL.map((label, i) => (
          <label key={label} className="block text-xs text-muted-foreground">
            {label}
            <select value={choices[i]} onChange={(e) => setChoices((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
              className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-2 text-sm text-foreground" aria-invalid={duplicate && picked.filter((p) => p === choices[i]).length > 1}>
              <option value="">{i === 0 ? 'Choose a model' : 'None'}</option>
              {registry.map((e) => (
                <option key={e.id} value={e.id} disabled={choices.some((c, j) => j !== i && c === e.id)}>
                  {e.label} · {COST[e.cost]}{e.configured ? '' : ' · not configured'}{e.admitted ? '' : ' · evaluation only'}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {duplicate && <p role="alert" className="text-xs text-[hsl(var(--denial))]">The same model cannot be chosen twice.</p>}
      {picked.map((id) => byId.get(id)).filter((e): e is Entry => Boolean(e)).map((e) => (
        <p key={e.id} className="text-xs text-muted-foreground"><span className="font-mono">{e.label}:</span> {e.note}</p>
      ))}
      {handoff && (
        <p className="text-xs text-[hsl(var(--pending-amber))]">
          {handoff.label} pauses automatic fallback when reached. Nothing is uploaded; you copy a brief yourself.{' '}
          {handoff.handoffUrl && <a href={handoff.handoffUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">Open <ExternalLink className="h-3 w-3" aria-hidden /></a>}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">Profile name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-1 block rounded-md border border-border bg-secondary px-2 py-2 text-sm text-foreground" />
        </label>
        <button type="button" disabled={busy || duplicate || picked.length === 0 || !name.trim()} onClick={() => void save(true)} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Save and use</button>
        <button type="button" disabled={busy || duplicate || picked.length === 0 || !name.trim()} onClick={() => void save(false)} className="rounded-md bg-secondary px-4 py-2 text-sm text-foreground disabled:opacity-50">Save only</button>
      </div>
      {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`text-xs ${msg.tone === 'error' ? 'text-[hsl(var(--denial))]' : 'text-muted-foreground'}`}>{msg.tone === 'error' ? 'Error: ' : ''}{msg.text}</p>}

      {profiles.length > 0 && (
        <ul className="space-y-1" aria-label="Saved profiles">
          {profiles.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-foreground">{p.name}</span>
              <span className="text-muted-foreground">{p.choices.map((c) => byId.get(c)?.label ?? c).join(' → ')} · rev {p.revision}</span>
              {p.active ? <span className="rounded border border-primary/50 px-1.5 py-0.5 font-mono text-[0.625rem] uppercase text-primary">Active</span>
                : <button type="button" disabled={busy} onClick={() => void activate(p.id)} className="rounded border border-border px-1.5 py-0.5 hover:border-primary/50">Use</button>}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-border p-3 text-xs" aria-live="polite">
        <p className="font-mono uppercase tracking-wider text-muted-foreground">Right now, for a private chat</p>
        {preview.steps.length === 0
          ? <p className="mt-1 text-[hsl(var(--denial))]">No choice is eligible. Chat will be refused until one is.</p>
          : <p className="mt-1 text-foreground">Uses <span className="font-mono">{byId.get(preview.steps[0].id)?.label ?? preview.steps[0].id}</span>{preview.steps[0].type === 'handoff' ? ' (manual handoff)' : ''}.</p>}
        {preview.skipped.map((s) => <p key={s.id} className="text-muted-foreground">Skipped {byId.get(s.id)?.label ?? s.id}: {REASON[s.reason] ?? s.reason}.</p>)}
        <p className="mt-1 text-muted-foreground">Paid models {preview.paidModelsAdmitted ? 'are admitted by the operator' : 'are not admitted unless you store your own key'}.{preview.lockedDown ? ' Lockdown limits chat to local models.' : ''}{preview.localOnly ? ' Local-Only mode is on.' : ''}</p>
        {!preview.profileId && <p className="text-muted-foreground">No saved profile yet: the local model is used.</p>}
      </div>
    </div>
  );
}

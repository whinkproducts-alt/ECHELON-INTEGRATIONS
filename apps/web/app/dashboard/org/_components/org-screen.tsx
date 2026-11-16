'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/* eslint-disable @typescript-eslint/no-explicit-any */
async function act(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch('/api/org/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: 'bad response' }));
}

const card = 'rounded-xl border border-border bg-card p-4 space-y-3';
const inp = 'rounded border border-border bg-background px-2 py-1 text-sm';
const btn = 'rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50';

export function OrgScreen({ data }: { data: any }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [k, setK] = useState({ entityKey: '', measureCode: data.measures[0], target: '', weight: '', periodDays: '' });
  const [pol, setPol] = useState({ t: data.policy?.promotionThreshold ?? '', n: data.policy?.periodsRequired ?? '' });
  const run = async (body: Record<string, unknown>) => { const r = await act(body); setMsg(r.ok ? 'Saved.' : `Refused: ${r.error ?? 'error'}`); if (r.ok) router.refresh(); };
  const name = (key: string) => data.entities.find((e: any) => e.key === key)?.name ?? key;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Organisation</h1>
          <p className="text-sm text-muted-foreground">{data.entities.length} people above agent level, {data.agentCount} agents. Targets, weights and thresholds are yours alone; scores are written only by the scoring job.</p>
        </div>
        <div className="flex gap-2">
          <Link className={btn} href="/executive/office/people">Talk to someone</Link>
          <button className={btn} onClick={() => run({ op: 'seed' })}>Sync from org-kit</button>
        </div>
      </header>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {data.entities.length === 0 && <p className="text-sm text-muted-foreground">The organisation is empty. Press "Sync from org-kit".</p>}

      <section className={card}>
        <h2 className="font-medium">KPI targets <span className="text-xs text-muted-foreground">(none exist until you set them)</span></h2>
        <div className="flex flex-wrap gap-2">
          <select className={inp} value={k.entityKey} onChange={(e) => setK({ ...k, entityKey: e.target.value })} aria-label="Entity">
            <option value="">Who…</option>{data.entities.map((e: any) => <option key={e.key} value={e.key}>{e.name}</option>)}
          </select>
          <select className={inp} value={k.measureCode} onChange={(e) => setK({ ...k, measureCode: e.target.value })} aria-label="Measure">{data.measures.map((m: string) => <option key={m}>{m}</option>)}</select>
          <input className={inp} placeholder="target" value={k.target} onChange={(e) => setK({ ...k, target: e.target.value })} aria-label="Target" />
          <input className={inp} placeholder="weight 0-1" value={k.weight} onChange={(e) => setK({ ...k, weight: e.target.value })} aria-label="Weight" />
          <input className={inp} placeholder="period days" value={k.periodDays} onChange={(e) => setK({ ...k, periodDays: e.target.value })} aria-label="Period days" />
          <button className={btn} disabled={!k.entityKey} onClick={() => run({ op: 'setKpi', entityKey: k.entityKey, measureCode: k.measureCode, target: Number(k.target), weight: Number(k.weight), periodDays: Number(k.periodDays) })}>Set</button>
        </div>
        <ul className="text-sm space-y-1">
          {data.kpis.map((x: any) => {
            const last = data.scores.find((s: any) => s.entityKey === x.entityKey && s.measureCode === x.measureCode);
            return <li key={x.id} className="flex justify-between"><span>{name(x.entityKey)}: {x.measureCode} target {x.target}, weight {x.weight}, every {x.periodDays}d</span>
              <span className="font-mono text-xs">{last ? (last.value === null ? 'no evidence' : `${Number(last.value).toFixed(3)} ${last.meetsTarget ? 'met' : 'missed'}`) : 'not scored yet'} <button className="underline" onClick={() => run({ op: 'deleteKpi', entityKey: x.entityKey, measureCode: x.measureCode })}>remove</button></span></li>;
          })}
          {data.kpis.length === 0 && <li className="text-muted-foreground">No KPIs set.</li>}
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-medium">Promotion trigger <span className="text-xs text-muted-foreground">(blank = never proposes)</span></h2>
        <div className="flex gap-2">
          <input className={inp} placeholder="score threshold 0-1" value={pol.t} onChange={(e) => setPol({ ...pol, t: e.target.value })} aria-label="Threshold" />
          <input className={inp} placeholder="periods in a row" value={pol.n} onChange={(e) => setPol({ ...pol, n: e.target.value })} aria-label="Periods" />
          <button className={btn} onClick={() => run({ op: 'setPolicy', promotionThreshold: pol.t === '' ? null : Number(pol.t), periodsRequired: pol.n === '' ? null : Number(pol.n) })}>Save</button>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-medium">Promotion proposals</h2>
        {data.promotions.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
        {data.promotions.map((p: any) => (
          <div key={p.id} className="text-sm border-t border-border pt-2">
            <div>{p.kind} {name(p.entityKey)} → {p.toRole} <span className="font-mono text-xs">[{p.status}]</span>{p.changesAccess && ' (changes access)'}</div>
            <div className="text-muted-foreground">Needs: {p.requiredKeys.map((rk: string) => { const a = p.approvals.find((x: any) => x.approverKey === rk); return `${name(rk)} ${a ? a.decision : 'waiting'}`; }).join(', ')}</div>
            {p.status === 'PENDING' && p.requiredKeys.filter((rk: string) => !p.approvals.some((a: any) => a.approverKey === rk)).map((rk: string) => (
              <span key={rk} className="mr-3">{name(rk)}: <button className="underline" onClick={() => run({ op: 'decide', id: p.id, approverKey: rk, decision: 'approve', contentHash: p.contentHash })}>approve</button> / <button className="underline" onClick={() => run({ op: 'decide', id: p.id, approverKey: rk, decision: 'reject', contentHash: p.contentHash })}>reject</button></span>
            ))}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Non-founder approvals are workflow gates you record. Approving never moves pay or changes access; pay is money and needs its own Class C approval.</p>
      </section>

      <section className={card}>
        <h2 className="font-medium">Subsidiary head reviews (twice a year)</h2>
        {data.reviews.length === 0 && <p className="text-sm text-muted-foreground">None open yet.</p>}
        {data.reviews.map((r: any) => (
          <div key={r.id} className="text-sm border-t border-border pt-2">
            <div>{name(r.entityKey)} {r.period} <span className="font-mono text-xs">[{r.status}]</span></div>
            <div>WHINK: {r.whinkView ?? 'no view yet'}</div>
            <div>MAMBA (hypothesis, confidence at most 0.4): {r.mambaView ?? 'no view yet'}</div>
          </div>
        ))}
      </section>

      <section className={card}>
        <h2 className="font-medium">HR training</h2>
        <p className="text-xs text-muted-foreground">Assigned {data.training.find((t: any) => t.status === 'ASSIGNED')?._count ?? 0}, passed {data.training.find((t: any) => t.status === 'PASSED')?._count ?? 0}.</p>
        {data.courses.map((c: any) => (
          <div key={c.id} className="flex justify-between text-sm"><span>{c.title}{c.mandatory && ' (mandatory)'}</span>
            <span className="font-mono text-xs">{c.contentStatus === 'APPROVED' ? 'approved' : 'Needs Victor: content, scenarios and pass mark'}</span></div>
        ))}
      </section>

      <section className={card}>
        <h2 className="font-medium">Learning per entity</h2>
        <p className="text-sm text-muted-foreground">{Object.keys(data.counts).length} entities have saved lessons. Open someone in <Link className="underline" href="/executive/office/people">the Founders Office</Link> to see theirs.</p>
      </section>
    </div>
  );
}

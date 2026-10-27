'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, LockKeyhole, Radar, Send, ShieldCheck } from 'lucide-react';

type Specialist = {
  id: string;
  name: string;
  role: string;
  handoff: string;
  accent: string;
};

const SPECIALISTS: Specialist[] = [
  { id: 'PETER', name: 'Peter', role: 'Forensics & reverse engineering', handoff: 'Verified evidence and capability map', accent: 'border-sky-500/30' },
  { id: 'PAUL', name: 'Paul', role: 'Clean-room reconstruction', handoff: 'Production implementation and tests', accent: 'border-violet-500/30' },
  { id: 'MICAH', name: 'Micah', role: 'Product audit & strategy', handoff: 'User value, risk, and product decisions', accent: 'border-amber-500/30' },
  { id: 'NANDI', name: 'Nandi', role: 'Growth, marketing & revenue', handoff: 'Distribution and monetisation opportunities', accent: 'border-emerald-500/30' },
  { id: 'SCOUT', name: 'Michael Carrick', role: 'Market research & opportunity scouting', handoff: 'Sources, signals, and opportunity leads', accent: 'border-rose-500/30' },
];

export function KillTeamScreen({ founder }: { founder: boolean }) {
  const [objective, setObjective] = useState('');
  const [brief, setBrief] = useState('');

  function assignObjective() {
    if (!founder || !objective.trim()) return;
    setBrief(objective.trim());
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-primary">Founder command</p>
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-display font-bold tracking-tight text-foreground"><Radar className="h-6 w-6 text-primary" /> Kill Team</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">A specialist group for research, deconstruction, product decisions, implementation, and growth. Kill Team work is separate from WHINK and MAMBA.</p>
        </div>
        <span className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-mono ${founder ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-border bg-secondary text-muted-foreground'}`}>
          <LockKeyhole className="h-3.5 w-3.5" /> {founder ? 'Founder access' : 'View only'}
        </span>
      </header>

      <section className="rounded-xl border border-border bg-card p-5" aria-labelledby="objective-heading">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Send className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="objective-heading" className="text-sm font-semibold text-foreground">Founder objective</h2>
            <p className="mt-1 text-xs text-muted-foreground">Only the founder can assign the team a direction. This brief is held in the current session until a durable objective workflow is enabled.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input value={objective} onChange={(e) => setObjective(e.target.value)} disabled={!founder} placeholder={founder ? 'What should the Kill Team investigate or build?' : 'Founder access required'} aria-label="Kill Team objective" className="min-h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60" />
              <button type="button" onClick={assignObjective} disabled={!founder || !objective.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /> Assign objective</button>
            </div>
            {brief && <p className="mt-3 rounded-md bg-secondary/60 px-3 py-2 text-sm text-foreground"><span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Active brief</span><br />{brief}</p>}
          </div>
        </div>
      </section>

      <section aria-labelledby="specialists-heading">
        <div className="mb-3 flex items-center justify-between"><h2 id="specialists-heading" className="text-sm font-semibold text-foreground">Specialists</h2><span className="font-mono text-xs text-muted-foreground">{SPECIALISTS.length} active roles</span></div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {SPECIALISTS.map((specialist) => <article key={specialist.id} className={`rounded-xl border bg-card p-4 ${specialist.accent}`}><div className="flex items-start justify-between gap-3"><div><h3 className="font-display font-semibold text-foreground">{specialist.name}</h3><p className="mt-1 text-xs text-muted-foreground">{specialist.role}</p></div><span className="rounded bg-secondary px-2 py-1 font-mono text-[0.625rem] text-muted-foreground">{specialist.id}</span></div><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ArrowRight className="h-3.5 w-3.5 text-primary" /> {specialist.handoff}</div></article>)}
        </div>
      </section>

      <section aria-labelledby="guardrails-heading" className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><h2 id="guardrails-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Allowed without another approval</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Research, analysis, evidence gathering, planning, drafts, code proposals, and testable implementation work within existing access boundaries.</p></div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><AlertTriangle className="h-4 w-4 text-amber-500" /> Always requires your approval</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Spending money, sending external communications, publishing, deleting data, changing production systems, or any other destructive or irreversible action.</p></div>
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Every specialist shares the app&apos;s existing audit and permission controls. The Kill Team does not bypass them.</p>
    </div>
  );
}

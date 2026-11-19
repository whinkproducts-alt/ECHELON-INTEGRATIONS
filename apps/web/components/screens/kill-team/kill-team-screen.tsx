'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { KillTeamRoster } from './kill-team-roster';
import { AlertTriangle, CheckCircle2, LockKeyhole, Send, ShieldCheck } from 'lucide-react';

export function KillTeamScreen({ founder }: { founder: boolean }) {
  const [objective, setObjective] = useState('');
  const [brief, setBrief] = useState('');

  function assignObjective() {
    if (!founder || !objective.trim()) return;
    setBrief(objective.trim());
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Kill Team"
        description="A specialist group for research, deconstruction, product decisions, implementation, and growth. WHINK and MAMBA remain the executive layer: they retain full authority, set direction, and cascade each request to the right directorate."
        actions={<span className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-xs font-mono ${founder ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground'}`}>
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden /> {founder ? 'Founder access' : 'View only'}
        </span>}
      />

      <section className="rounded-xl border border-border bg-card p-5" aria-labelledby="objective-heading">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Send className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="objective-heading" className="text-sm font-semibold text-foreground">Founder objective</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Only the founder can assign the team a direction. WHINK and MAMBA can then decompose the objective, brief the involved directors, and coordinate the specialists without reducing their executive authority.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input value={objective} onChange={(e) => setObjective(e.target.value)} disabled={!founder} placeholder={founder ? 'What should the Kill Team investigate or build?' : 'Founder access required'} aria-label="Kill Team objective" className="min-h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60" />
              <button type="button" onClick={assignObjective} disabled={!founder || !objective.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /> Assign objective</button>
            </div>
            {brief && <p className="mt-3 rounded-md bg-secondary/60 px-3 py-2 text-sm text-foreground"><span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Active brief</span><br />{brief}</p>}
          </div>
        </div>
      </section>

      <KillTeamRoster founder={founder} />

      <section aria-labelledby="guardrails-heading" className="grid divide-y divide-border rounded-xl border border-border bg-card md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-5"><h2 id="guardrails-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Allowed without another approval</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Research, analysis, evidence gathering, planning, drafts, code proposals, and testable implementation work within existing access boundaries.</p></div>
        <div className="p-5"><h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden /> Always requires your approval</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Spending money, sending external communications, publishing, deleting data, changing production systems, or any other destructive or irreversible action.</p></div>
      </section>

      <section aria-labelledby="registration-limits-heading" className="rounded-xl border border-border bg-card p-4">
        <h2 id="registration-limits-heading" className="text-sm font-semibold text-foreground">Website Registration capability</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">This specialist can prepare and track a signup for you. Gmail and password-manager connections are not implemented, and arbitrary-site browser automation is disabled by project policy. Complete signup, email verification, and password saving in the site and your password manager. The agent must stop if a card, auto-renewing trial, payment, or unclear pricing appears.</p>
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Every specialist shares the app&apos;s existing audit and permission controls. The Kill Team does not bypass them.</p>
    </div>
  );
}

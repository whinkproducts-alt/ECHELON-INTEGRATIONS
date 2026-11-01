'use client';
// SubsidiariesScreen: no props. Fetches GET /api/subsidiaries. Five logo cards plus the Unassigned card.
import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, FolderOpen, Network } from 'lucide-react';
import { HoloButton, HoloEmpty, HoloHeading, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { TiltCard } from '@/components/screens/board/tilt-card';
import { accentStyle } from './accent';
import { fmtDate } from './format';
import { SubsidiaryLogo } from './subsidiary-logo';
import { useJson } from './use-json';
import type { SubsidiariesResponse, SubsidiarySummary } from './types';
import './subsidiaries.css';

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-[hsl(var(--base)/0.5)] px-3 py-2">
      <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-2xl tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function SubsidiaryCard({ s }: { s: SubsidiarySummary }) {
  return (
    <li style={accentStyle(s.id)} className="sub-scope sub-rise">
      <TiltCard>
        <HoloPanel as="article" glow="soft" brackets className="relative h-full">
          <SubsidiaryLogo id={s.id} name={s.name} src={s.logo} sizes="(max-width: 640px) 90vw, (max-width: 1280px) 45vw, 30vw" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-foreground holo-text-glow">
            <Link href={`/dashboard/subsidiaries/${s.id}`} className="after:absolute after:inset-0 after:z-10 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{s.name}</Link>
          </h2>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <Counter label="Active projects" value={s.counts.active} />
            <Counter label="Open tasks" value={s.openTasks} />
            <Counter label="Open risks" value={s.openRisks} />
          </dl>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            {s.nextMilestone
              ? <span><span className="text-foreground">{s.nextMilestone.title}</span>, {s.nextMilestone.projectName}, <span className="font-mono">{fmtDate(s.nextMilestone.dueDate)}</span></span>
              : <span>No upcoming milestone</span>}
          </p>
          <p className="mt-3 inline-flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-primary">Open portfolio <ArrowRight className="h-3.5 w-3.5" aria-hidden /></p>
        </HoloPanel>
      </TiltCard>
    </li>
  );
}

function GroupStrip({ names }: { names: string[] }) {
  return (
    <HoloPanel as="section" aria-label="Group structure" className="overflow-x-auto">
      <div className="flex min-w-max flex-col items-center gap-3 sm:min-w-0">
        <span className="inline-flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.25em] text-primary"><Network className="h-4 w-4" aria-hidden />Group</span>
        <span aria-hidden className="h-4 w-px bg-primary/60" />
        <ul className="flex flex-wrap justify-center gap-2">
          {names.map((n) => <li key={n} className="rounded-full border border-border bg-[hsl(var(--base)/0.6)] px-3 py-1 text-xs text-foreground">{n}</li>)}
        </ul>
      </div>
    </HoloPanel>
  );
}

export function SubsidiariesScreen() {
  const { result, retry } = useJson<SubsidiariesResponse>('/api/subsidiaries');
  let body: React.ReactNode;
  if (result.state === 'loading') {
    body = (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading subsidiaries</span>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="sub-shimmer h-96" />)}
        </div>
      </div>
    );
  } else if (result.state === 'error' || result.state === 'notfound') {
    body = <HoloEmpty state="error" title="Subsidiaries could not be loaded" description="The portfolio service did not answer. Your projects are safe. Try again in a moment." action={<HoloButton onClick={retry}>Retry</HoloButton>} />;
  } else if (result.data.subsidiaries.length === 0) {
    body = <HoloEmpty title="No subsidiaries configured" description="Subsidiaries are defined in config/subsidiaries.json. Add them there and they appear here." />;
  } else {
    const { subsidiaries, unassigned } = result.data;
    body = (
      <>
        <GroupStrip names={subsidiaries.map((s) => s.name)} />
        <ul className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
          {subsidiaries.map((s) => <SubsidiaryCard key={s.id} s={s} />)}
          <li style={accentStyle('unassigned')} className="sub-scope sub-rise">
            <HoloPanel as="article" tone="neutral" interactive className="relative h-full">
              <div className="flex flex-col items-start gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-[hsl(var(--base))] text-muted-foreground"><FolderOpen className="h-7 w-7" aria-hidden /></span>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  <Link href="/dashboard/subsidiaries/unassigned" className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Unassigned projects</Link>
                </h2>
                <p className="text-sm text-muted-foreground">Every project belongs to one subsidiary. These do not yet. Assign each one so its full report lives on the right page.</p>
                <dl className="grid w-full grid-cols-2 gap-2"><Counter label="Projects" value={unassigned.total} /><Counter label="Active" value={unassigned.active} /></dl>
                <p className="inline-flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-primary">Review and assign <ArrowRight className="h-3.5 w-3.5" aria-hidden /></p>
              </div>
            </HoloPanel>
          </li>
        </ul>
      </>
    );
  }
  return (
    <div className="relative isolate min-h-full overflow-hidden">
      <HoloOrbBackdrop stars={70} />
      <div className="relative z-10 mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">
        <HoloHeading eyebrow="Group portfolio" title="Subsidiaries" description="Five subsidiaries, one group. Projects are assigned to a subsidiary and its page holds the full project reports." />
        {body}
      </div>
    </div>
  );
}

'use client';
// WorkforceScreen: explorer for the org-kit roster (packages/org-kit). Only data present in the repo is shown.
// Registry text (missions, titles) is data: rendered as text, never as HTML and never spliced into prompts here.
import * as React from 'react';
import { Search } from 'lucide-react';
import { HoloBadge, HoloButton, HoloDrawer, HoloEmpty, HoloHeading, HoloMeter, HoloOrbBackdrop, HoloPanel, HoloStat } from '@/components/ui/holo';
import type { WorkforceAgent, WorkforceData } from './types';

const PAGE = 24;
const label = (s: string) => s.replace(/_/g, ' ');

export function WorkforceScreen({ data, error }: { data: WorkforceData | null; error?: string | null }) {
  const [dir, setDir] = React.useState<string | null>(null);
  const [q, setQ] = React.useState('');
  const [limit, setLimit] = React.useState(PAGE);
  const [open, setOpen] = React.useState<WorkforceAgent | null>(null);

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
        <HoloHeading eyebrow="Workforce" title="AI Workforce" />
        <HoloEmpty state="error" title="The roster could not be loaded" description={error ?? 'No roster data was returned. Check that packages/org-kit is present or set ORG_KIT_PATH.'} />
      </div>
    );
  }

  const counts = new Map<string, number>();
  data.agents.forEach((a) => counts.set(a.directorate, (counts.get(a.directorate) ?? 0) + 1));
  const maxCount = Math.max(1, ...counts.values());
  const term = q.trim().toLowerCase();
  const list = data.agents.filter((a) => (!dir || a.directorate === dir) && (!term || `${a.name} ${a.title} ${a.department} ${a.team}`.toLowerCase().includes(term)));
  const shown = list.slice(0, limit);
  const dormant = data.agents.filter((a) => a.state === 'dormant').length;
  const current = data.directorates.find((d) => d.name === dir) ?? null;

  return (
    <div className="relative isolate min-h-full overflow-hidden">
      <HoloOrbBackdrop stars={60} floor={false} />
      <div className="relative z-10 mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">
        <HoloHeading eyebrow="Workforce" title="AI Workforce" description="Every agent in the organisation kit, by directorate. Loading this roster activates nothing." />

        <HoloPanel tone="neutral" role="note" aria-label="Roster status">
          <p className="text-sm text-foreground"><span className="mr-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">Info</span>
            Roster loaded from packages/org-kit: {data.agents.length} agents in {data.directorates.length} directorates. {dormant === data.agents.length ? 'All agents are dormant.' : `${dormant} of ${data.agents.length} agents are dormant.`}
          </p>
          {data.mismatches.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Registry counts differ from the manifest: {data.mismatches.join('; ')}.</p>}
        </HoloPanel>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HoloStat label="Agents" value={data.agents.length} />
          <HoloStat label="Directorates" value={data.directorates.length} />
          <HoloStat label="Teams" value={data.manifest.teamCount} />
          <HoloStat label="Skills" value={data.manifest.skillCount} />
        </div>

        <section aria-labelledby="dir-title" className="space-y-3">
          <h2 id="dir-title" className="font-display text-xl font-semibold text-foreground">Directorates</h2>
          {data.directorates.length === 0 ? <HoloEmpty title="No directorates" description="The leadership file lists none." /> : (
            <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))]">
              {data.directorates.map((d) => (
                <li key={d.name}>
                  <HoloPanel as="div" interactive tone={dir === d.name ? 'accent' : 'deep'} glow={dir === d.name ? 'soft' : 'none'} role="button" aria-pressed={dir === d.name}
                    onClick={() => { setDir(dir === d.name ? null : d.name); setLimit(PAGE); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDir(dir === d.name ? null : d.name); setLimit(PAGE); } }} className="h-full">
                    <p className="font-display text-sm font-semibold text-foreground">{d.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{d.director ? `Director: ${d.director}` : 'Director not listed'}</p>
                    <div className="mt-3"><HoloMeter label={`${d.name} agents`} value={counts.get(d.name) ?? 0} max={maxCount} valueText={`${counts.get(d.name) ?? 0} agents`} /></div>
                    <p className="mt-2 font-mono text-[0.6875rem] text-muted-foreground">{Object.keys(d.departments).length} departments</p>
                  </HoloPanel>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="agents-title" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="agents-title" className="font-display text-xl font-semibold text-foreground">{current ? current.name : 'All agents'} <span className="font-mono text-sm text-muted-foreground">({list.length})</span></h2>
            <label className="relative w-full max-w-xs"><span className="sr-only">Search agents</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search name, title or team"
                className="w-full rounded-md border border-border bg-[hsl(var(--base)/0.6)] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            </label>
          </div>
          {current && Object.keys(current.departments).length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">{Object.entries(current.departments).map(([dep, head]) => <li key={dep}><HoloBadge tone="neutral">{dep}: {head}</HoloBadge></li>)}</ul>
          )}
          {list.length === 0 ? <HoloEmpty title="No agents match" description="Clear the search or choose another directorate." /> : (
            <>
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
                {shown.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => setOpen(a)} className="holo-panel block h-full w-full p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={`${a.name}, ${a.title}. Open details`}>
                      <p className="font-display text-sm font-semibold text-foreground">{a.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.title}</p>
                      <p className="mt-2 truncate font-mono text-[0.625rem] text-muted-foreground">{a.team}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5"><HoloBadge tone="neutral">{label(a.state)}</HoloBadge><HoloBadge tone="deep">Autonomy {a.autonomy}</HoloBadge></div>
                    </button>
                  </li>
                ))}
              </ul>
              {shown.length < list.length && (
                <div className="flex justify-center"><HoloButton variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>Show more ({list.length - shown.length} left)</HoloButton></div>
              )}
            </>
          )}
        </section>
      </div>

      <HoloDrawer open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }} title={open?.name ?? 'Agent'} description={open?.title} width="30rem">
        {open && (
          <dl className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-1.5"><HoloBadge tone="neutral">{label(open.state)}</HoloBadge><HoloBadge tone="deep">Autonomy {open.autonomy}</HoloBadge></div>
            {([['Directorate', open.directorate], ['Department', open.department], ['Team', open.team], ['Reports to (human)', open.reportsToHuman], ['Mission', open.mission]] as const).map(([k, v]) => (
              <div key={k}><dt className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">{k}</dt><dd className="mt-1 text-foreground">{v || 'Not listed'}</dd></div>
            ))}
            {([['Responsibilities', open.responsibilities], ['Skills', open.skills], ['Needs human approval for', open.approvalsRequiredFor]] as const).map(([k, v]) => (
              <div key={k}><dt className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">{k}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">{v.length ? v.map((x) => <HoloBadge key={x} tone="neutral">{label(x)}</HoloBadge>) : <span className="text-muted-foreground">None listed</span>}</dd></div>
            ))}
          </dl>
        )}
      </HoloDrawer>
    </div>
  );
}

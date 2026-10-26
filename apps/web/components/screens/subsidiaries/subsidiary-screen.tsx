'use client';
// SubsidiaryScreen props: { id: string; subsidiary: SubsidiaryInfo | null }.
// subsidiary is null (and id is 'unassigned') for the unassigned portfolio. Fetches GET /api/subsidiaries/[id]/projects.
import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Info, MapPin, UserCircle2 } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloGrid, HoloHeading, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { PersonaAvatar } from '@/components/ui/persona-avatar';
import { accentStyle } from './accent';
import { humanize } from './format';
import { ProjectPortfolioCard } from './project-card';
import { SubsidiaryContracts } from '@/components/screens/contracts/subsidiary-contracts';
import { SubsidiaryLogo } from './subsidiary-logo';
import { useJson } from './use-json';
import type { ProjectCardData, SubsidiaryInfo, SubsidiaryProjectsResponse } from './types';
import './subsidiaries.css';

type SortKey = 'updated' | 'progress' | 'name' | 'milestone';

function sortProjects(list: ProjectCardData[], key: SortKey): ProjectCardData[] {
  const copy = [...list];
  const due = (p: ProjectCardData) => (p.nextMilestone?.dueDate ? Date.parse(p.nextMilestone.dueDate) : Number.POSITIVE_INFINITY);
  if (key === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
  else if (key === 'progress') copy.sort((a, b) => b.progress.percent - a.progress.percent);
  else if (key === 'milestone') copy.sort((a, b) => due(a) - due(b));
  else copy.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return copy;
}

function Portfolio({ id, name }: { id: string; name: string }) {
  const { result, retry } = useJson<SubsidiaryProjectsResponse>(`/api/subsidiaries/${encodeURIComponent(id)}/projects`);
  const [filter, setFilter] = React.useState<string>('ALL');
  const [sort, setSort] = React.useState<SortKey>('updated');
  const unassigned = id === 'unassigned';

  if (result.state === 'loading') {
    return (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading projects</span>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="sub-shimmer h-56" />)}
        </div>
      </div>
    );
  }
  if (result.state !== 'ok') {
    return <HoloEmpty state="error" title="Projects could not be loaded" description="The portfolio did not answer. Try again in a moment." action={<HoloButton onClick={retry}>Retry</HoloButton>} />;
  }
  const projects = result.data.projects;
  if (projects.length === 0) {
    return <HoloEmpty title={unassigned ? 'Every project has a subsidiary' : `No projects assigned to ${name} yet`} description={unassigned ? 'Nothing is waiting to be assigned.' : 'Assign a project to this subsidiary from its working view and its full report appears here.'}
      action={<HoloButton href="/dashboard/projects" variant="ghost">Open projects</HoloButton>} />;
  }
  const statuses = Array.from(new Set(projects.map((p) => p.status)));
  const shown = sortProjects(filter === 'ALL' ? projects : projects.filter((p) => p.status === filter), sort);
  const sortId = `sort-${id}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {['ALL', ...statuses].map((s) => {
            const n = s === 'ALL' ? projects.length : projects.filter((p) => p.status === s).length;
            return <button key={s} type="button" className="sub-chip" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s === 'ALL' ? 'All' : humanize(s)} <span className="font-mono tabular-nums">{n}</span></button>;
          })}
        </div>
        <label htmlFor={sortId} className="flex items-center gap-2 text-xs text-muted-foreground">Sort by
          <select id={sortId} className="sub-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="updated">Recently updated</option>
            <option value="progress">Progress</option>
            <option value="milestone">Next milestone</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <HoloEmpty title="No projects match this filter" action={<HoloButton variant="ghost" onClick={() => setFilter('ALL')}>Show all</HoloButton>} />
      ) : (
        <HoloGrid as="ul" min="20rem" gap="1rem">
          {shown.map((p) => (
            <li key={p.id}>
              <ProjectPortfolioCard p={p}
                href={unassigned ? `/dashboard/projects/${encodeURIComponent(p.id)}` : `/dashboard/subsidiaries/${encodeURIComponent(id)}/projects/${encodeURIComponent(p.id)}`}
                assignHref={unassigned ? `/dashboard/projects/${encodeURIComponent(p.id)}` : undefined} />
            </li>
          ))}
        </HoloGrid>
      )}
    </div>
  );
}

function Hero({ s }: { s: SubsidiaryInfo }) {
  return (
    <div className="space-y-6">
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
        <SubsidiaryLogo id={s.id} name={s.name} src={s.logo} sizes="(max-width: 768px) 90vw, 22rem" priority className="w-full" />
        <div className="space-y-4">
          <HoloHeading eyebrow="Subsidiary" title={s.name} description={s.intro} />
          {s.location && <HoloBadge tone="accent"><MapPin className="h-3 w-3" aria-hidden />{s.location}</HoloBadge>}
        </div>
      </div>
      {s.notice && (
        <HoloPanel as="section" aria-label="Notice" role="note" className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm text-foreground"><span className="mr-2 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-primary">Notice</span>{s.notice}</p>
        </HoloPanel>
      )}
    </div>
  );
}

function Directors({ s }: { s: SubsidiaryInfo }) {
  if (s.directors.length === 0) return null;
  return (
    <section aria-labelledby="dir-title" className="space-y-3">
      <h2 id="dir-title" className="font-display text-xl font-semibold text-foreground">{s.directors.length === 1 ? 'Executive director' : 'Executive directors'}</h2>
      <HoloGrid as="ul" min="18rem">
        {s.directors.map((d) => (
          <li key={d.name}>
            <HoloPanel className="h-full">
              <div className="flex items-center gap-4">
                <PersonaAvatar name={d.name} imageUrl={d.imageUrl ?? undefined} size="lg" />
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold text-foreground">{d.name}</p>
                  <p className="text-sm text-muted-foreground">{d.title}</p>
                  {d.boardId && <Link href="/dashboard/board" className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"><UserCircle2 className="h-3.5 w-3.5" aria-hidden />View in the Board Room</Link>}
                </div>
              </div>
            </HoloPanel>
          </li>
        ))}
      </HoloGrid>
    </section>
  );
}

export function SubsidiaryScreen({ id, subsidiary }: { id: string; subsidiary: SubsidiaryInfo | null }) {
  const name = subsidiary?.name ?? 'Unassigned projects';
  return (
    <div className="sub-scope relative isolate min-h-full overflow-hidden" style={accentStyle(id)}>
      <div className="sub-aura" aria-hidden />
      <HoloOrbBackdrop stars={50} floor={false} />
      <div className="relative z-10 mx-auto w-full max-w-7xl space-y-10 p-4 sm:p-8">
        <Link href="/dashboard/subsidiaries" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden />All subsidiaries</Link>
        {subsidiary ? <Hero s={subsidiary} /> : (
          <div className="space-y-4">
            <HoloHeading eyebrow="Portfolio" title="Unassigned projects" />
            <HoloPanel as="section" role="note" className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <p className="text-sm text-foreground">These projects do not belong to a subsidiary yet. Open each one and assign it, then its full report moves to the right subsidiary page.</p>
            </HoloPanel>
          </div>
        )}
        <div className="sub-hairline" aria-hidden />
        <section aria-labelledby="portfolio-title" className="space-y-4">
          <h2 id="portfolio-title" className="font-display text-2xl font-semibold text-foreground">Project portfolio</h2>
          <Portfolio id={id} name={name} />
        </section>
        {subsidiary && (
          <section aria-labelledby="contracts-title" className="space-y-4">
            <h2 id="contracts-title" className="font-display text-2xl font-semibold text-foreground">Contracts</h2>
            <SubsidiaryContracts subsidiaryId={id} />
          </section>
        )}
        {subsidiary && <Directors s={subsidiary} />}
        {subsidiary && (
          <>
            <section aria-labelledby="about-title" className="space-y-3">
              <h2 id="about-title" className="font-display text-xl font-semibold text-foreground">About</h2>
              <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{subsidiary.about}</p>
            </section>
            {subsidiary.services.length > 0 && (
              <section aria-labelledby="svc-title" className="space-y-3">
                <h2 id="svc-title" className="font-display text-xl font-semibold text-foreground">Services</h2>
                <HoloGrid as="ul" min="16rem">
                  {subsidiary.services.map((sv) => (
                    <li key={sv.title}><HoloPanel className="h-full"><h3 className="font-display text-base font-semibold text-foreground">{sv.title}</h3><p className="mt-1 text-sm text-muted-foreground">{sv.description}</p></HoloPanel></li>
                  ))}
                </HoloGrid>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

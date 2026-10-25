'use client';
// ProjectReportScreen props: { subsidiaryId: string; projectId: string }. Fetches GET /api/projects/[id]/report.
// Redirects client-side to the canonical URL when the project's subsidiary differs, or to the working view when unassigned.
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Printer } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloMeter, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { accentStyle } from './accent';
import { fmtDate, fmtDateTime, humanize, levelTone, plural, statusTone } from './format';
import { ProgressRing, SubsidiaryLogo } from './subsidiary-logo';
import { useJson } from './use-json';
import type { ProjectReport } from './types';
import './subsidiaries.css';

const TASK_ORDER = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];

function Section({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 space-y-3">
      <h2 id={`${id}-h`} className="flex items-baseline gap-3 font-display text-xl font-semibold text-foreground">{title}{count !== undefined && <span className="font-mono text-sm tabular-nums text-muted-foreground">{count}</span>}</h2>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{children}</p>;
const Meta = ({ k, v }: { k: string; v: React.ReactNode }) => <span><span className="text-muted-foreground">{k} </span><span className="font-mono text-foreground">{v}</span></span>;

function Report({ r, subsidiaryId }: { r: ProjectReport; subsidiaryId: string }) {
  const [generated, setGenerated] = React.useState<string | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => setGenerated(fmtDateTime(new Date())), 0); // client-only timestamp, set from a callback
    return () => clearTimeout(t);
  }, []);
  const { project: p, progress } = r;
  const tasksBy = (s: string) => r.tasks.filter((t) => t.status.toUpperCase() === s);
  const known = new Set(TASK_ORDER);
  const groups = [...TASK_ORDER.map((s) => ({ s, items: tasksBy(s) })), { s: 'OTHER', items: r.tasks.filter((t) => !known.has(t.status.toUpperCase())) }].filter((g) => g.items.length > 0);
  const sub = r.subsidiary;
  const nav = [['summary', 'Summary'], ['milestones', 'Milestones'], ['tasks', 'Tasks'], ['decisions', 'Decisions'], ['risks', 'Risks'], ['questions', 'Open questions'], ['team', 'Team']];
  return (
    <div className="sub-report relative z-10 mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/subsidiaries/${encodeURIComponent(subsidiaryId)}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden />{sub?.name ?? 'Subsidiary'} portfolio</Link>
        <div className="flex gap-2">
          <HoloButton variant="ghost" size="sm" href={`/dashboard/projects/${encodeURIComponent(p.id)}`} rightIcon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />}>Open working view</HoloButton>
          <HoloButton size="sm" onClick={() => window.print()} leftIcon={<Printer className="h-3.5 w-3.5" aria-hidden />}>Print report</HoloButton>
        </div>
      </div>

      <header className="space-y-4">
        {sub && (
          <Link href={`/dashboard/subsidiaries/${encodeURIComponent(subsidiaryId)}`} className="sub-chip no-underline">
            <span className="relative block h-6 w-6 overflow-hidden rounded-full"><SubsidiaryLogo id={sub.id} name={sub.name} src={sub.logo} sizes="24px" className="!rounded-full !border-0 !shadow-none h-6 w-6" /></span>{sub.name}
          </Link>
        )}
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.28em] text-primary">Project report</p>
        <h1 className="holo-text-glow font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{p.name}</h1>
        <div className="flex flex-wrap items-center gap-3"><HoloBadge tone={statusTone(p.status)} dot>{humanize(p.status)}</HoloBadge>
          <span className="text-xs text-muted-foreground">Created <span className="font-mono">{fmtDate(p.createdAt)}</span>, updated <span className="font-mono">{fmtDate(p.updatedAt)}</span></span></div>
        {p.goal && <p className="max-w-3xl text-base text-foreground"><span className="mr-2 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-primary">Goal</span>{p.goal}</p>}
        {p.description && <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{p.description}</p>}
      </header>

      <nav aria-label="Report sections" className="no-print flex gap-2 overflow-x-auto pb-1">
        {nav.map(([id, label]) => <a key={id} href={`#${id}`} className="sub-chip whitespace-nowrap">{label}</a>)}
      </nav>

      <Section id="summary" title="Progress">
        <HoloPanel glow="soft" brackets>
          <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
            <div className="flex justify-center"><ProgressRing percent={progress.percent} size={120} label="Overall progress" /></div>
            <div className="space-y-4">
              <HoloMeter value={progress.tasksDone} max={Math.max(1, progress.tasksTotal)} label="Tasks done" valueText={`${progress.tasksDone} of ${progress.tasksTotal}`} />
              <ul className="flex flex-wrap gap-2">
                {TASK_ORDER.map((s) => <li key={s}><HoloBadge tone={statusTone(s)}>{humanize(s)} <span className="font-mono tabular-nums">{tasksBy(s).length}</span></HoloBadge></li>)}
              </ul>
            </div>
          </div>
        </HoloPanel>
      </Section>

      <Section id="milestones" title="Milestones" count={r.milestones.length}>
        {r.milestones.length === 0 ? <Empty>No milestones recorded.</Empty> : (
          <ol className="sub-timeline space-y-4">
            {r.milestones.map((m) => {
              const done = !!m.completedAt || ['COMPLETED', 'DONE'].includes(m.status.toUpperCase());
              return (
                <li key={m.id} data-done={done}>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-foreground">{m.title}</span><HoloBadge tone={statusTone(done ? 'DONE' : m.status)}>{done ? 'Completed' : humanize(m.status)}</HoloBadge></div>
                  <p className="font-mono text-xs text-muted-foreground">{done && m.completedAt ? `Completed ${fmtDate(m.completedAt)}` : `Target ${fmtDate(m.targetDate)}`}</p>
                  {m.description && <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <Section id="tasks" title="Tasks" count={r.tasks.length}>
        {r.tasks.length === 0 ? <Empty>No tasks recorded.</Empty> : groups.map((g) => (
          <HoloPanel key={g.s} as="section" aria-label={`${humanize(g.s)} tasks`}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><HoloBadge tone={statusTone(g.s)}>{humanize(g.s)}</HoloBadge><span className="font-mono text-xs text-muted-foreground">{g.items.length}</span></h3>
            <ul className="divide-y divide-border">
              {g.items.map((t) => (
                <li key={t.id} className="py-2">
                  <p className="text-sm text-foreground">{t.title}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {t.priority && <Meta k="Priority" v={humanize(t.priority)} />}
                    {t.assignee && <Meta k="Owner" v={t.assignee} />}
                    {t.dueDate && <Meta k="Due" v={fmtDate(t.dueDate)} />}
                  </p>
                  {t.description && <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>}
                </li>
              ))}
            </ul>
          </HoloPanel>
        ))}
      </Section>

      <Section id="decisions" title="Decisions" count={r.decisions.length}>
        {r.decisions.length === 0 ? <Empty>No decisions recorded.</Empty> : (
          <ul className="space-y-3">{r.decisions.map((d) => (
            <li key={d.id}><HoloPanel>
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium text-foreground">{d.title}</h3><span className="font-mono text-xs text-muted-foreground">{fmtDate(d.decidedAt)}{d.decidedBy ? `, ${d.decidedBy}` : ''}</span></div>
              {d.description && <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>}
              {d.rationale && <p className="mt-2 text-sm"><span className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-primary">Rationale </span><span className="text-foreground">{d.rationale}</span></p>}
            </HoloPanel></li>))}</ul>
        )}
      </Section>

      <Section id="risks" title="Risks" count={r.risks.length}>
        {r.risks.length === 0 ? <Empty>No risks recorded.</Empty> : (
          <ul className="space-y-3">{r.risks.map((k) => (
            <li key={k.id}><HoloPanel tone={levelTone(k.severity)}>
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-foreground">{k.title}</h3>
                {k.severity && <HoloBadge tone={levelTone(k.severity)}>Severity {humanize(k.severity)}</HoloBadge>}
                {k.likelihood && <HoloBadge tone="neutral">Likelihood {humanize(k.likelihood)}</HoloBadge>}
                {k.status && <HoloBadge tone={statusTone(k.status)}>{humanize(k.status)}</HoloBadge>}</div>
              {k.description && <p className="mt-1 text-sm text-muted-foreground">{k.description}</p>}
              {k.mitigation && <p className="mt-2 text-sm"><span className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-primary">Mitigation </span><span className="text-foreground">{k.mitigation}</span></p>}
            </HoloPanel></li>))}</ul>
        )}
      </Section>

      <Section id="questions" title="Open questions" count={r.openQuestions.length}>
        {r.openQuestions.length === 0 ? <Empty>No open questions.</Empty> : (
          <ul className="space-y-3">{r.openQuestions.map((q) => (
            <li key={q.id}><HoloPanel>
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-foreground">{q.question}</h3>{q.status && <HoloBadge tone={statusTone(q.status)}>{humanize(q.status)}</HoloBadge>}</div>
              {q.context && <p className="mt-1 text-sm text-muted-foreground">{q.context}</p>}
              <p className="mt-1 flex flex-wrap gap-x-4 text-xs">{q.assignedTo && <Meta k="Assigned to" v={q.assignedTo} />}{q.answeredAt && <Meta k="Answered" v={fmtDate(q.answeredAt)} />}</p>
              {q.answer && <p className="mt-2 text-sm text-foreground"><span className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-primary">Answer </span>{q.answer}</p>}
            </HoloPanel></li>))}</ul>
        )}
      </Section>

      <Section id="team" title="Team" count={r.members.length}>
        {r.members.length === 0 ? <Empty>No members recorded.</Empty> : (
          <ul className="flex flex-wrap gap-2">{r.members.map((m) => <li key={m.userId} className="rounded-lg border border-border bg-[hsl(var(--base)/0.5)] px-3 py-2 text-sm"><span className="text-foreground">{m.name ?? 'Team member'}</span> <span className="font-mono text-xs text-muted-foreground">{humanize(m.role)}</span></li>)}</ul>
        )}
      </Section>

      <footer className="sub-hairline-wrap border-t border-border pt-4 text-xs text-muted-foreground">
        Report generated <span className="font-mono">{generated ?? 'just now'}</span>. {plural(r.tasks.length, 'task')}, {plural(r.milestones.length, 'milestone')}, {plural(r.risks.length, 'risk')}.
      </footer>
    </div>
  );
}

export function ProjectReportScreen({ subsidiaryId, projectId }: { subsidiaryId: string; projectId: string }) {
  const router = useRouter();
  const { result, retry } = useJson<ProjectReport>(`/api/projects/${encodeURIComponent(projectId)}/report`);
  const target = result.state === 'ok'
    ? (!result.data.project.subsidiary ? `/dashboard/projects/${encodeURIComponent(projectId)}`
      : result.data.project.subsidiary !== subsidiaryId ? `/dashboard/subsidiaries/${encodeURIComponent(result.data.project.subsidiary)}/projects/${encodeURIComponent(projectId)}` : null)
    : null;
  React.useEffect(() => { if (target) router.replace(target); }, [target, router]);

  let body: React.ReactNode;
  if (result.state === 'loading' || target) {
    body = (
      <div role="status" aria-busy="true" aria-live="polite" className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-8">
        <span className="sr-only">{target ? 'Opening the right report' : 'Loading project report'}</span>
        <div className="sub-shimmer h-10 w-1/2" aria-hidden /><div className="sub-shimmer h-40" aria-hidden /><div className="sub-shimmer h-64" aria-hidden />
      </div>
    );
  } else if (result.state === 'notfound') {
    body = <div className="p-6"><HoloEmpty title="Project not found" description="It may have been deleted, or you do not have access." action={<HoloButton href={`/dashboard/subsidiaries/${encodeURIComponent(subsidiaryId)}`} variant="ghost">Back to portfolio</HoloButton>} /></div>;
  } else if (result.state === 'error') {
    body = <div className="p-6"><HoloEmpty state="error" title="The report could not be loaded" description="Try again in a moment." action={<HoloButton onClick={retry}>Retry</HoloButton>} /></div>;
  } else {
    body = <Report r={result.data} subsidiaryId={subsidiaryId} />;
  }
  return (
    <div className="sub-scope relative isolate min-h-full overflow-hidden" style={accentStyle(subsidiaryId)}>
      <div className="sub-aura" aria-hidden />
      <HoloOrbBackdrop stars={40} floor={false} />
      {body}
    </div>
  );
}

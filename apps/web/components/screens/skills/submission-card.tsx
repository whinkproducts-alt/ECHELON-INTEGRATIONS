'use client';
// One submission with its live four stage pipeline. Scan score and committee votes come from the detail route, fetched on expand.
import * as React from 'react';
import { Check, ChevronDown, CircleDashed, Clock, Loader2, ShieldAlert, Trash2, X } from 'lucide-react';
import { HoloBadge, HoloButton, HoloPanel, type HoloTone } from '@/components/ui/holo';
import { SafeDate } from '@/components/safe-format';
import { cn } from '@/lib/utils';
import { useJson } from '@/components/screens/usage/use-json';
import { STATE_TEXT, outcomeFor, stagesFor, type SkillDetailResponse, type SkillListItem, type StageState } from './types';

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
const sumCounts = (c: Record<string, number> | null | undefined) => (c ? Object.values(c).reduce((a, b) => a + b, 0) : 0);

const STAGE_TONE: Record<StageState, HoloTone> = { done: 'accent', active: 'accent', waiting: 'neutral', failed: 'ember', todo: 'neutral' };

function StageIcon({ state }: { state: StageState }) {
  const c = 'h-3.5 w-3.5';
  if (state === 'done') return <Check className={c} aria-hidden />;
  if (state === 'failed') return <X className={c} aria-hidden />;
  if (state === 'active') return <Loader2 className={cn(c, 'motion-safe:animate-spin')} aria-hidden />;
  if (state === 'waiting') return <Clock className={c} aria-hidden />;
  return <CircleDashed className={c} aria-hidden />;
}

function Pipeline({ item }: { item: SkillListItem }) {
  const stages = stagesFor(item);
  return (
    <ol aria-label="Pipeline stages" className="grid gap-2 sm:grid-cols-4">
      {stages.map((s, i) => (
        <li key={s.id} className={cn('rounded-md border border-border/60 p-2.5', s.state === 'todo' && 'opacity-60')} aria-current={s.state === 'active' ? 'step' : undefined}>
          <div className="flex items-center gap-2">
            <span className={cn('flex h-6 w-6 items-center justify-center rounded-full', `holo-tone-${STAGE_TONE[s.state]}`)}
              style={{ color: 'hsl(var(--holo-c))', background: 'hsl(var(--holo-c) / 0.12)', border: '1px solid hsl(var(--holo-c) / 0.45)' }}>
              <StageIcon state={s.state} />
            </span>
            <span className="min-w-0 text-sm font-medium text-foreground">{i + 1}. {s.label}</span>
          </div>
          <p className="mt-1 font-mono text-[0.6875rem] uppercase tracking-[0.15em] text-muted-foreground">{STATE_TEXT[s.state]}</p>
        </li>
      ))}
    </ol>
  );
}

function Details({ item }: { item: SkillListItem }) {
  // The updatedAt query value re-fetches the detail whenever the pipeline moves; the route ignores it.
  const { loading, status, data } = useJson<SkillDetailResponse>(`/api/skills/${encodeURIComponent(item.id)}?v=${encodeURIComponent(item.updatedAt)}`);
  if (loading) return <p role="status" className="text-sm text-muted-foreground">Loading review details...</p>;
  const d = data?.submission;
  if (status !== 200 || !d) return <p role="alert" className="text-sm text-muted-foreground">Review details did not load. The status above is still accurate.</p>;
  const scan = d.scanReport;
  const agent = scan?.agent;
  const committee = d.committee;
  return (
    <div className="space-y-4 border-t border-border/60 pt-4">
      <section aria-label="Security scan" className="space-y-2">
        <h4 className="flex items-center gap-2 font-display text-base font-semibold text-foreground"><ShieldAlert className="h-4 w-4" aria-hidden /> Security scan</h4>
        {!scan ? (
          <p className="text-sm text-muted-foreground">The scan has not run yet.</p>
        ) : (
          <>
            <p className="font-mono text-xs text-muted-foreground">
              Score <span className="text-foreground">{scan.score ?? 'n/a'}</span> (lower is safer), verdict <span className="text-foreground">{scan.verdict ?? 'n/a'}</span>, {sumCounts(scan.counts)} findings
              {scan.counts ? ` (${Object.entries(scan.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ') || 'none'})` : ''}
            </p>
            {scan.findings && scan.findings.length > 0 && (
              <ul className="space-y-1 text-sm">
                {scan.findings.slice(0, 8).map((f, i) => (
                  <li key={`${f.rule}-${i}`} className="flex flex-wrap gap-x-2 text-muted-foreground">
                    <HoloBadge tone="neutral">{f.severity}</HoloBadge>
                    <span className="min-w-0 break-words text-foreground">{f.message}</span>
                    {f.line !== null && <span className="font-mono text-xs">line {f.line}</span>}
                  </li>
                ))}
                {scan.findings.length > 8 && <li className="text-xs text-muted-foreground">and {scan.findings.length - 8} more</li>}
              </ul>
            )}
            {agent && (
              <p className="text-sm text-muted-foreground">
                Reviewed by <span className="text-foreground">{agent.name}</span>: {agent.verdict.verdict}, confidence {Math.round(agent.verdict.confidence * 100)}%.
                {agent.verdict.findings.length > 0 && <span className="block break-words">{agent.verdict.findings.slice(0, 4).join(' / ')}</span>}
              </p>
            )}
          </>
        )}
      </section>

      <section aria-label="Committee review" className="space-y-2">
        <h4 className="font-display text-base font-semibold text-foreground">Committee of three directors</h4>
        {!committee?.members?.length ? (
          <p className="text-sm text-muted-foreground">{item.status === 'REJECTED_SECURITY' ? 'Not reached: the skill was stopped at the security scan.' : 'The committee has not voted yet.'}</p>
        ) : (
          <>
            <ul className="grid gap-3 md:grid-cols-3">
              {committee.members.map((m) => (
                <li key={m.id} className="rounded-md border border-border/60 p-3">
                  <p className="text-sm font-medium text-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.directorate}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <HoloBadge tone={m.vote.approve ? 'accent' : 'neutral'}>{m.vote.approve ? 'Approved' : 'Did not approve'}</HoloBadge>
                    <span className="font-mono text-xs text-muted-foreground">value {m.vote.valueScore} of 5</span>
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {m.vote.reasons.slice(0, 4).map((r, i) => <li key={i} className="break-words">{r}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="font-mono text-xs text-muted-foreground">
              {committee.approvals} approvals, mean value {committee.meanScore}. Needs {committee.minApprovals} approvals and a mean of {committee.threshold}.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

export function SubmissionCard({ item, onDelete }: { item: SkillListItem; onDelete: (item: SkillListItem) => void }) {
  const [open, setOpen] = React.useState(false);
  const outcome = outcomeFor(item.status);
  const panelId = React.useId();
  const waiting = item.status === 'WAITING_MODEL';
  const live = item.status === 'QUEUED' || item.status === 'SCANNING' || item.status === 'ASSESSING';
  return (
    <HoloPanel as="article" tone={outcome.tone === 'denial' ? 'denial' : 'deep'} aria-label={`Skill ${item.name}`} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-display text-lg font-semibold tracking-tight text-foreground">{item.name}</h3>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {item.filename} · {kb(item.sizeBytes)} · <SafeDate date={item.createdAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <HoloBadge tone={outcome.tone} dot pulse={live}>{outcome.label}</HoloBadge>
        </div>
      </div>

      <Pipeline item={item} />

      {waiting && <p role="status" className="text-sm text-muted-foreground">Waiting for a model to be configured. Nothing has been added to memory. It retries by itself once a model is available.</p>}
      {item.reason && !waiting && <p className="break-words text-sm text-muted-foreground"><span className="text-foreground">Decision: </span>{item.reason}</p>}

      <dl className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
        {item.scan && <div className="flex gap-1.5"><dt>Scan score</dt><dd className="text-foreground">{item.scan.score ?? 'n/a'}</dd><dt>findings</dt><dd className="text-foreground">{sumCounts(item.scan.counts)}</dd></div>}
        {item.committeeSummary && <div className="flex gap-1.5"><dt>Directors approved</dt><dd className="text-foreground">{item.committeeSummary.approvals ?? 'n/a'} of 3</dd><dt>mean value</dt><dd className="text-foreground">{item.committeeSummary.meanScore ?? 'n/a'}</dd></div>}
        {item.status === 'ACCEPTED' && <div className="flex gap-1.5"><dt>Memory entries</dt><dd className="text-foreground">{item.memoryCount}</dd></div>}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden /> {open ? 'Hide review details' : 'Show review details'}
        </button>
        <HoloButton variant="ghost" size="sm" tone="neutral" leftIcon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => onDelete(item)} aria-label={`Delete skill ${item.name}`}>Delete</HoloButton>
      </div>
      {open && <div id={panelId}><Details item={item} /></div>}
    </HoloPanel>
  );
}

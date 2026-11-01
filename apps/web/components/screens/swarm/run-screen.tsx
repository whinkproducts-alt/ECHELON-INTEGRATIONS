'use client';
// Run view for one swarm: live progress, lane board, shared learnings, tokens, cancel and the final report.
// Polls GET /api/swarm/[id] every 3 seconds while RUNNING or FINALIZING, and pauses while the tab is hidden.
import * as React from 'react';
import { ArrowLeft, RefreshCw, Square } from 'lucide-react';
import { toast } from 'sonner';
import { HoloBadge, HoloButton, HoloEmpty, HoloHeading, HoloMeter, HoloModal, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { PersonaAvatar } from '@/components/ui/persona-avatar';
import { SafeDate } from '@/components/safe-format';
import { PlanPanel, RoleMix } from './plan-panel';
import { RUN_STATUS, STOP_TEXT, TASK_STATUS } from './status';
import { usePolledJson } from './use-polled-json';
import { ROLE_META, fmtCompact, fmtInt, isLive, type RunDetail, type RunTask, type TaskStatus } from './types';

const COLUMNS: TaskStatus[] = ['PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED'];

function TaskCard({ t }: { t: RunTask }) {
  const name = t.agentName ?? 'Agent';
  return (
    <HoloPanel as="li" tone={ROLE_META[t.role].tone} edge={false} padded={false} className="p-2.5">
      <div className="flex items-start gap-2">
        <PersonaAvatar name={name} size="sm" />
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-foreground">{name}</p>
          <p className="break-words text-xs text-muted-foreground">{t.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <HoloBadge tone={ROLE_META[t.role].tone}>{ROLE_META[t.role].label}</HoloBadge>
            {t.attempts > 1 && <span className="font-mono text-[0.6875rem] text-muted-foreground">attempt {t.attempts}</span>}
            {t.tokens > 0 && <span className="font-mono text-[0.6875rem] text-muted-foreground">{fmtCompact(t.tokens)} tok</span>}
          </div>
          {t.status === 'FAILED' && t.error && <p className="mt-1 break-words text-xs text-muted-foreground">{t.error}</p>}
        </div>
      </div>
    </HoloPanel>
  );
}

function LaneBoard({ tasks }: { tasks: RunTask[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" role="group" aria-label="Lane board">
      {COLUMNS.map((c) => {
        const items = tasks.filter((t) => t.status === c);
        const meta = TASK_STATUS[c];
        return (
          <section key={c} aria-label={`${meta.label} lanes`} className="min-w-0 rounded-lg border border-border/60 p-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <HoloBadge tone={meta.tone} dot pulse={meta.pulse && items.length > 0}>{meta.label}</HoloBadge>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">None</p>
            ) : (
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">{items.map((t) => <TaskCard key={t.lane} t={t} />)}</ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function SwarmRunScreen({ id }: { id: string }) {
  const url = `/api/swarm/${encodeURIComponent(id)}`;
  const run = usePolledJson<RunDetail>(url, { intervalMs: 3000, shouldPoll: (d) => isLive(d.run.status) });
  const [confirm, setConfirm] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const { reload } = run;

  const cancel = () => {
    setCancelling(true);
    fetch(`${url}/cancel`, { method: 'POST' })
      .then((r) => {
        if (r.ok) toast.success('Cancel requested. In flight calls finish, nothing new starts.');
        else toast.error(r.status === 409 ? 'This run already finished.' : 'Cancel failed. The run is still going.');
        setConfirm(false);
        reload();
      })
      .catch(() => toast.error('Network error. The run is still going.'))
      .then(() => setCancelling(false));
  };

  const shell = (inner: React.ReactNode) => (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={40} />
      <div className="relative mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">{inner}</div>
    </div>
  );
  const back = <HoloButton href="/dashboard/swarm" variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden />}>All runs</HoloButton>;

  if (run.loading) {
    return shell(<><div>{back}</div><div role="status" aria-busy="true"><span className="sr-only">Loading run</span><HoloPanel tone="deep" edge={false} className="h-64 animate-pulse" aria-hidden><div className="h-full rounded bg-secondary" /></HoloPanel></div></>);
  }
  if (run.status === 404) return shell(<><div>{back}</div><HoloEmpty state="error" title="Run not found" description="It may belong to another account or no longer exist." /></>);
  if (run.status === 401) return shell(<HoloEmpty state="error" title="Sign in to see this run" action={<HoloButton href="/login" size="sm">Sign in</HoloButton>} />);
  if (run.status !== 200 || !run.data) {
    return shell(<><div>{back}</div><HoloEmpty state="error" title="The run did not load" description="The server did not return this run. Nothing has changed." action={<HoloButton size="sm" onClick={reload}>Try again</HoloButton>} /></>);
  }

  const d = run.data;
  const r = d.run;
  const s = RUN_STATUS[r.status] ?? RUN_STATUS.FAILED;
  const total = d.tasks.length;
  const finished = (d.counts.DONE ?? 0) + (d.counts.FAILED ?? 0) + (d.counts.SKIPPED ?? 0);
  const live = isLive(r.status);
  const nearCap = d.tokens.cap > 0 && d.tokens.actual >= d.tokens.cap * 0.9;

  if (r.status === 'PLANNED') {
    return shell(<>
      <div>{back}</div>
      <HoloHeading eyebrow="Swarm" title="Review the plan" description="This run is planned and waiting for you." />
      <PlanPanel run={r} tasks={d.tasks} budget={null} onStarted={reload} />
    </>);
  }

  return shell(<>
    <div>{back}</div>
    <HoloHeading eyebrow="Swarm run" title={r.title}
      description={<span className="inline-flex flex-wrap items-center gap-2"><HoloBadge tone={s.tone} dot pulse={s.pulse}>{r.cancelRequested && live ? 'Cancelling' : s.label}</HoloBadge>
        <span className="font-mono text-xs">{r.startedAt ? <>Started <SafeDate date={r.startedAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize /></> : 'Not started'}</span></span>}
      actions={<>
        <HoloButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={reload}>Refresh</HoloButton>
        {live && <HoloButton variant="danger" size="sm" disabled={r.cancelRequested} leftIcon={<Square className="h-4 w-4" aria-hidden />} onClick={() => setConfirm(true)}>{r.cancelRequested ? 'Cancelling' : 'Cancel run'}</HoloButton>}
      </>} />

    {run.stale && <p role="status" className="text-xs text-muted-foreground">Live updates are paused after a failed refresh. Showing the last known state.</p>}

    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <HoloPanel tone="accent" brackets glow={live ? 'soft' : 'none'} className="flex flex-col items-center gap-3 text-center">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.25em] text-muted-foreground">Progress</p>
        <HoloMeter variant="arc" size={190} value={finished} max={Math.max(1, total)} label={`${finished} of ${total} lanes finished`} valueText={`${total ? Math.round((finished / total) * 100) : 0}%`} />
        <p className="font-mono text-xs text-muted-foreground" aria-live="polite">{finished} of {total} lanes finished</p>
      </HoloPanel>
      <HoloPanel tone="deep" className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {COLUMNS.map((c) => (
            <div key={c}><dt className="text-xs text-muted-foreground">{TASK_STATUS[c].label}</dt><dd className="font-mono text-2xl tabular-nums text-foreground">{fmtInt(d.counts[c] ?? 0)}</dd></div>
          ))}
        </dl>
        <RoleMix roles={r.estimate.roles} total={r.estimate.agents} />
        <HoloMeter limit={nearCap} value={d.tokens.actual} max={Math.max(1, d.tokens.cap)}
          label={`Tokens used, estimated ${fmtCompact(d.tokens.estimated)}, cap ${fmtCompact(d.tokens.cap)}`}
          valueText={`${fmtCompact(d.tokens.actual)} of ${fmtCompact(d.tokens.cap)}`} />
        <p className="font-mono text-xs text-muted-foreground">Estimated {fmtInt(d.tokens.estimated)} tokens · actual so far {fmtInt(d.tokens.actual)} · run cap {fmtInt(d.tokens.cap)}</p>
        {r.stopReason && <p className="text-sm text-foreground">{STOP_TEXT[r.stopReason] ?? 'The run stopped early.'}</p>}
      </HoloPanel>
    </div>

    <section aria-label="Final report" className="space-y-3">
      <HoloHeading level={2} eyebrow="Result" title="Final report" tone="deep" />
      {r.status === 'DONE' && d.result ? (
        <HoloPanel tone="deep" className="space-y-3">
          {d.resultUntrusted && <p className="text-xs text-muted-foreground">This report was written by models from untrusted inputs. Read it as text, and check anything it tells you to do.</p>}
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{d.result}</div>
        </HoloPanel>
      ) : (
        <HoloEmpty state={live ? 'loading' : r.status === 'DONE' ? 'empty' : 'error'}
          title={live ? 'The report is written when every lane has finished' : r.status === 'DONE' ? 'No report text was produced' : r.status === 'CANCELLED' ? 'Cancelled before a report' : 'No report: the run did not complete'}
          description={live ? `${finished} of ${total} lanes finished so far.` : undefined} />
      )}
    </section>

    <section aria-label="Lane board" className="space-y-3">
      <HoloHeading level={2} eyebrow="Lanes" title="Lane board" tone="deep" />
      {total === 0 ? <HoloEmpty title="No lanes" /> : <LaneBoard tasks={d.tasks} />}
    </section>

    <section aria-label="Shared learnings" className="space-y-3">
      <HoloHeading level={2} eyebrow="Shared" title="Learnings feed" tone="deep" description="Short notes agents share with each other, newest first." />
      {d.learnings.length === 0 ? (
        <HoloEmpty title="No learnings yet" description={live ? 'They appear as lanes finish.' : 'This run recorded none.'} />
      ) : (
        <HoloPanel tone="deep">
          <ul className="max-h-96 space-y-3 overflow-y-auto pr-1" aria-live="polite">
            {d.learnings.map((l, i) => (
              <li key={`${l.lane}-${l.createdAt}-${i}`} className="border-b border-border/50 pb-2 last:border-0">
                <p className="break-words text-sm text-foreground">{l.text}</p>
                <p className="font-mono text-xs text-muted-foreground">{l.lane} · confidence {Math.round(l.confidence * 100)}% · <SafeDate date={l.createdAt} options={{ timeStyle: 'short' }} localize /></p>
              </li>
            ))}
          </ul>
        </HoloPanel>
      )}
    </section>

    <HoloModal open={confirm} onOpenChange={(o) => { if (!cancelling) setConfirm(o); }} title="Cancel this swarm?"
      description="No new lanes will start. Calls already in flight finish and their tokens are still counted. Finished lanes are kept."
      footer={<>
        <HoloButton variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={cancelling}>Keep running</HoloButton>
        <HoloButton variant="danger" size="sm" loading={cancelling} onClick={cancel}>Cancel run</HoloButton>
      </>}>
      <p className="text-sm text-muted-foreground">The cancellation is written to the ledger.</p>
    </HoloModal>
  </>);
}

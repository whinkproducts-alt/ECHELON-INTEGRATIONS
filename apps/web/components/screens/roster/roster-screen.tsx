'use client';
// Standing Roster: the always-on organisation. Agents come from the server page (config/standing-roster.json); live
// facts come from GET /api/worker/status. Status dots pulse only while the worker heartbeat is alive.
import * as React from 'react';
import { Moon, RefreshCw, Server } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloHeading, HoloOrbBackdrop, HoloPanel, HoloStat, StatusDot, HoloGrid, type HoloTone } from '@/components/ui/holo';
import { PersonaAvatar } from '@/components/ui/persona-avatar';
import { SafeDate } from '@/components/safe-format';
import { usePolledJson } from '@/components/screens/swarm/use-polled-json';
import { GROUP_ORDER, groupLabel, humanize, pulseOf, type Pulse, type RosterAgentView, type SystemJobView, type WorkerJobRow, type WorkerStatus } from './types';

const PULSE_UI: Record<Pulse, { label: string; tone: HoloTone }> = {
  alive: { label: 'Worker alive', tone: 'accent' },
  stale: { label: 'Worker stale', tone: 'ember' },
  never: { label: 'Worker never seen', tone: 'ember' },
};

function age(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

function WorkerPanel({ status, loading, failed, reload }: { status: WorkerStatus | null; loading: boolean; failed: boolean; reload: () => void }) {
  if (loading) {
    return <HoloPanel tone="deep" edge={false} className="h-28 animate-pulse" role="status" aria-busy="true"><span className="sr-only">Checking the worker</span></HoloPanel>;
  }
  if (failed || !status) {
    return <HoloEmpty state="error" title="Worker status did not load" description="The agents below come from configuration, but whether the worker is running is unknown." action={<HoloButton size="sm" onClick={reload}>Try again</HoloButton>} />;
  }
  const p = pulseOf(status.heartbeatAgeSeconds);
  const ui = PULSE_UI[p];
  return (
    <HoloPanel tone={ui.tone} glow={p === 'alive' ? 'soft' : 'none'} brackets className="space-y-3" aria-label="Worker heartbeat">
      <div className="flex flex-wrap items-center gap-3">
        <Server className="h-5 w-5" style={{ color: 'hsl(var(--holo-c))' }} aria-hidden />
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">Background worker</h2>
        <HoloBadge tone={ui.tone} dot pulse={p === 'alive'}>{ui.label}</HoloBadge>
        {status.heartbeatAgeSeconds !== null && <span className="font-mono text-xs text-muted-foreground">last heartbeat {age(status.heartbeatAgeSeconds)} ago</span>}
      </div>
      {p === 'never' && (
        <p role="status" className="text-sm text-foreground">Worker not running: start <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">pnpm worker</code> on the Mac Mini. Until then no scheduled job runs and the dates below are only planned times.</p>
      )}
      {p === 'stale' && (
        <p role="status" className="text-sm text-foreground">The worker has not reported for over a minute. It may have stopped: check <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">pnpm worker</code> on the Mac Mini.</p>
      )}
      {p === 'alive' && <p className="text-sm text-muted-foreground">The organisation is running. Jobs wake on their own schedules.</p>}
      {!status.enabled && <p className="text-sm text-muted-foreground">The server setting WORKER_ENABLED is not true, so the web app reports the worker as switched off.</p>}
    </HoloPanel>
  );
}

function lastLine(j: WorkerJobRow | undefined) {
  if (!j) return <span className="text-muted-foreground">Not scheduled yet</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      {j.lastRunAt ? <SafeDate date={j.lastRunAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize /> : <span className="text-muted-foreground">Never run</span>}
      {j.lastStatus && <HoloBadge tone={/fail|error|timeout|denied/i.test(j.lastStatus) ? 'ember' : 'neutral'}>{humanize(j.lastStatus.toLowerCase())}</HoloBadge>}
    </span>
  );
}

function AgentCard({ a, job, p }: { a: RosterAgentView; job: WorkerJobRow | undefined; p: Pulse | null }) {
  const running = a.enabled && a.job !== null;
  const dotTone: HoloTone = !running ? 'neutral' : p === 'alive' ? 'accent' : p === null ? 'neutral' : 'ember';
  const dotLabel = !running ? 'Standby' : p === 'alive' ? 'On duty' : p === null ? 'Status unknown' : 'Idle: worker not running';
  return (
    <HoloPanel as="article" tone={running && p === 'alive' ? 'accent' : 'deep'} edge={false} aria-label={a.name} className="h-full space-y-3">
      <div className="flex items-start gap-3">
        <PersonaAvatar name={a.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-display text-base font-semibold tracking-tight text-foreground">{a.name}</h3>
          <p className="break-all font-mono text-xs text-muted-foreground">{a.email}</p>
        </div>
        <StatusDot tone={dotTone} pulse={running && p === 'alive'} label={dotLabel} showLabel />
      </div>
      <p className="break-words text-sm text-muted-foreground">{a.role}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
        <dt className="text-muted-foreground">Job</dt><dd className="text-foreground">{a.job ? humanize(a.job) : 'None yet'}</dd>
        <dt className="text-muted-foreground">Schedule</dt><dd className="text-foreground">{a.schedule}</dd>
        <dt className="text-muted-foreground">Model tier</dt><dd className="text-foreground">{a.modelTier}</dd>
        <dt className="text-muted-foreground">Last run</dt><dd className="text-foreground">{running ? lastLine(job) : 'Standby'}</dd>
      </dl>
      {!running && <HoloBadge tone="neutral">Standby, no scheduled job</HoloBadge>}
    </HoloPanel>
  );
}

export function RosterScreen({ agents, systemJobs = [], dailyModelCalls = null }: { agents: RosterAgentView[]; systemJobs?: SystemJobView[]; dailyModelCalls?: number | null }) {
  const st = usePolledJson<WorkerStatus>('/api/worker/status', { intervalMs: 15000, shouldPoll: () => true });
  const status = st.status === 200 ? st.data : null;
  const failed = !st.loading && !status;
  const p: Pulse | null = status ? pulseOf(status.heartbeatAgeSeconds) : null;
  const jobs = React.useMemo(() => new Map((status?.jobs ?? []).map((j) => [j.jobKey, j])), [status]);
  const enabledProps = agents.filter((a) => a.enabled && a.job).length;

  const groups = React.useMemo(() => {
    const ids = [...GROUP_ORDER.filter((g) => agents.some((a) => a.group === g)), ...Array.from(new Set(agents.map((a) => a.group))).filter((g) => !(GROUP_ORDER as readonly string[]).includes(g))];
    return ids.map((g) => ({ id: g, items: agents.filter((a) => a.group === g) }));
  }, [agents]);

  return (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={70} />
      <div className="relative mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">
        <HoloHeading eyebrow="Operations" title="Standing Roster"
          description="The organisation that never sleeps: agents on standing schedules, watching news, projects, security and memory while you are away."
          actions={<HoloButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={st.reload} loading={st.loading}>Refresh</HoloButton>} />

        <WorkerPanel status={status} loading={st.loading} failed={failed} reload={st.reload} />

        <HoloGrid fit min="12rem">
          <HoloStat label="Roster size" value={status?.rosterSize ?? agents.length} tone="accent" />
          <HoloStat label="Enabled" value={status?.enabledCount ?? enabledProps} tone="deep" />
          <HoloPanel tone="neutral">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Model calls per day</p>
            <p className="mt-2 font-mono text-3xl tabular-nums text-foreground">{dailyModelCalls === null ? 'Unknown' : `up to ${Math.round(dailyModelCalls)}`}</p>
            <p className="mt-1 text-xs text-muted-foreground">An upper bound at default schedules. Most jobs skip when nothing changed.</p>
          </HoloPanel>
        </HoloGrid>

        {agents.length === 0 ? (
          <HoloEmpty icon={<Moon className="h-6 w-6" aria-hidden />} title="The roster is empty" description="config/standing-roster.json lists no agents, so nothing runs in the background." />
        ) : (
          <>
            <section aria-label="Jobs" className="space-y-3">
              <HoloHeading level={2} eyebrow="Schedule" title="Jobs" tone="deep" />
              {st.loading ? (
                <HoloPanel tone="deep" edge={false} className="h-24 animate-pulse" role="status" aria-busy="true"><span className="sr-only">Loading jobs</span></HoloPanel>
              ) : failed ? (
                <HoloEmpty state="error" title="Jobs did not load" description="Job history comes from the status route, which did not answer." />
              ) : (status?.jobs.length ?? 0) === 0 ? (
                <HoloEmpty title="No jobs scheduled for your account yet" description={p === 'alive' ? 'The worker creates them on its next loop.' : 'The worker creates jobs when it runs. Start pnpm worker on the Mac Mini.'} />
              ) : (
                <HoloPanel tone="deep" padded={false} className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <caption className="sr-only">Scheduled jobs with last run, status and next run</caption>
                    <thead><tr className="border-b border-border/60 font-mono text-[0.6875rem] uppercase tracking-[0.15em] text-muted-foreground">
                      <th scope="col" className="p-3">Job</th><th scope="col" className="p-3">Last run</th><th scope="col" className="p-3">Next run</th><th scope="col" className="p-3 text-right">Runs</th>
                    </tr></thead>
                    <tbody>
                      {status!.jobs.map((j) => {
                        const [type, ...rest] = j.jobKey.split(':');
                        const owner = agents.find((a) => a.key === rest.join(':'));
                        const sys = systemJobs.find((s) => s.key === rest.join(':'));
                        return (
                          <tr key={j.jobKey} className="border-b border-border/40 last:border-0">
                            <th scope="row" className="p-3 font-normal"><span className="block text-foreground">{humanize(type)}</span><span className="block text-xs text-muted-foreground">{owner ? owner.name : sys ? 'System job' : rest.join(':')}</span></th>
                            <td className="p-3">{lastLine(j)}</td>
                            <td className="p-3 font-mono text-xs"><SafeDate date={j.nextRunAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize /></td>
                            <td className="p-3 text-right font-mono tabular-nums">{j.runs}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </HoloPanel>
              )}
              {systemJobs.length > 0 && <p className="text-xs text-muted-foreground">System jobs, no model: {systemJobs.map((s) => `${humanize(s.job)} (${s.schedule})`).join(', ')}.</p>}
            </section>

            {groups.map((g) => (
              <section key={g.id} aria-label={groupLabel(g.id)} className="space-y-3">
                <HoloHeading level={2} eyebrow={`${g.items.length} ${g.items.length === 1 ? 'agent' : 'agents'}`} title={groupLabel(g.id)} tone="deep" />
                <HoloGrid min="18rem" gap="0.875rem" as="ul">
                  {g.items.map((a) => <li key={a.key}><AgentCard a={a} p={p} job={a.job ? jobs.get(`${a.job}:${a.key}`) : undefined} /></li>)}
                </HoloGrid>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

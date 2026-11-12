'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { PERSONAS, type PersonaType } from '@/lib/personas';
import { dashboardJson } from '@/lib/dashboard-client';
import { loadMonitorSection, startMonitorPolling } from '@/lib/dashboard-monitor-refresh';
import { useDashboardDataClient } from '@/components/shell/dashboard-data-provider';
import { DASHBOARD_KEYS } from '@/lib/dashboard-query-cache';
import { readMonitorProjects } from '@/lib/dashboard-projects';
import { SubsidiaryChip } from '@/components/subsidiaries/subsidiary-chip';
import { projectReportHref } from '@/components/subsidiaries/subsidiary-map';

/**
 * Operations monitor. This is a MONITOR surface: dense, glanceable, real data.
 * No marketing hero, no fabricated metrics. Every number comes from the worker
 * and ledger APIs. Rows are separated by hairlines, not cards.
 */

type JobRow = {
  jobKey: string;
  lastStatus: string | null;
  runs: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

type WorkerStatus = {
  rosterSize: number;
  enabledCount: number;
  heartbeatAgeSeconds: number | null;
  jobs: JobRow[];
};

type ActivityRow = {
  id: string;
  action: string;
  persona: string | null;
  status: string;
  createdAt: string;
};

type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  subsidiary?: string | { id?: string } | null;
  openTaskCount?: number;
  progress?: { percent?: number };
};

function subsidiaryIdOf(p: ProjectSummary): string | null {
  const s = p.subsidiary;
  if (!s) return null;
  return typeof s === 'string' ? s : (s.id ?? null);
}

const PERSONA_BY_STAFF: Record<string, PersonaType> = {
  'amara-okafor': 'AMARA',
  'mateo-restrepo': 'MATEO',
  'priya-raghunathan': 'PRIYA',
  'soren-oconnell': 'SOREN',
  'mei-ling-tan': 'MEI_LING',
  'self-improvement': 'MAYA',
  'whink': 'WHINK',
  'mamba': 'MAMBA',
};

const DESK_LABEL: Record<string, string> = {
  'news-americas': 'News · Americas',
  'news-europe-africa': 'News · Europe & Africa',
  'news-asia-pacific': 'News · Asia-Pacific',
  'news-tech-ai': 'News · Tech & AI',
  'news-markets-business': 'News · Markets',
  'news-canada': 'News · Canada',
  'monitor-consult': 'Monitor · Consult',
  'monitor-real-estate': 'Monitor · Real Estate',
  'monitor-trades': 'Monitor · Trades',
  'monitor-apps': 'Monitor · Apps',
  'monitor-frontliners': 'Monitor · Frontliners',
  'security-soc': 'Security · SOC',
  'security-threat-intel': 'Security · Threat intel',
  'security-vuln': 'Security · Protected actions',
  'memory-curator-dedupe': 'Memory · Dedupe',
  'memory-curator-decay': 'Memory · Decay',
  'skills-sweeper': 'Skills sweeper',
  'swarm-resume': 'Swarm resume',
};

const JOB_LABEL: Record<string, string> = {
  opportunity_scan: 'Opportunity scan',
  news_digest: 'News digest',
  weekly_brief: 'Weekly brief',
  self_improvement: 'Self-improvement',
  project_monitor: 'Project monitor',
  memory_curation: 'Memory curation',
  security_watch: 'Security watch',
  skills_sweeper: 'Skills sweeper',
  swarm_resume: 'Swarm resume',
};

const GROUP_ORDER = [
  'weekly_brief',
  'opportunity_scan',
  'news_digest',
  'self_improvement',
  'project_monitor',
  'memory_curation',
  'security_watch',
  'skills_sweeper',
  'swarm_resume',
];

function humanize(key: string): string {
  return key
    .split('-')
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function rowName(jobKey: string): { name: string; sub: string } {
  const [job, key = ''] = jobKey.split(':');
  const persona = PERSONA_BY_STAFF[key];
  const name = persona ? PERSONAS[persona].name : DESK_LABEL[key] ?? humanize(key);
  return { name, sub: JOB_LABEL[job] ?? humanize(job) };
}

function relative(iso: string | null, now: number): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

function until(iso: string | null, now: number): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.round((t - now) / 1000);
  if (s <= 0) return 'due';
  if (s < 60) return `in ${s}s`;
  if (s < 3600) return `in ${Math.round(s / 60)}m`;
  if (s < 86_400) return `in ${Math.round(s / 3600)}h`;
  return `in ${Math.round(s / 86_400)}d`;
}

function statusTone(status: string | null): string {
  if (!status) return 'text-muted-foreground';
  if (status === 'OK') return 'text-[hsl(var(--whink-accent))]';
  if (status === 'FAILED' || status === 'TIMEOUT') return 'text-[hsl(var(--denial))]';
  return 'text-muted-foreground';
}

function dotClass(status: string | null): string {
  if (status === 'OK') return 'bg-[hsl(var(--whink-accent))]';
  if (status === 'FAILED' || status === 'TIMEOUT') return 'bg-[hsl(var(--denial))]';
  if (status === 'SKIPPED') return 'bg-[hsl(var(--pending-amber))]';
  return 'bg-muted-foreground/40';
}

export function DashboardMonitor({
  onOpenConversation,
  active = true,
}: {
  onOpenConversation: () => void;
  active?: boolean;
}) {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [workerUpdatedAt, setWorkerUpdatedAt] = useState<number | null>(null);
  const inFlight = useRef<AbortSignal | null>(null);
  const polling = useRef<ReturnType<typeof startMonitorPolling> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const queryClient = useDashboardDataClient();

  const load = useCallback(async (signal: AbortSignal) => {
    if (signal.aborted || (inFlight.current && !inFlight.current.aborted)) return;
    inFlight.current = signal; setRefreshing(true);
    const array = <T,>(data: T[]): T[] => {
      if (!Array.isArray(data)) throw new Error('Unexpected service response.');
      return data;
    };
    const message = (reason: unknown) => typeof navigator !== 'undefined' && !navigator.onLine
      ? 'Offline. Reconnect and refresh.'
      : reason instanceof Error ? reason.message : 'Service unavailable. Try again.';
    await Promise.all([
      loadMonitorSection(() => dashboardJson<WorkerStatus>('/api/worker/status', { signal }).then((data) => {
        if (!Array.isArray(data.jobs) || typeof data.rosterSize !== 'number' || typeof data.enabledCount !== 'number') throw new Error('Unexpected service response.');
        return data;
      }), signal, (value) => { setStatus(value); setWorkerUpdatedAt(Date.now()); setError(null); }, (reason) => setError(message(reason))),
      loadMonitorSection(() => dashboardJson<ActivityRow[]>('/api/ledger?limit=15', { signal }).then(array),
        signal, (value) => { setActivity(value); setActivityError(null); }, (reason) => setActivityError(message(reason))),
      loadMonitorSection(() => readMonitorProjects<ProjectSummary>(queryClient, signal),
        signal, (value) => { setProjects(value); setProjectsError(null); }, (reason) => setProjectsError(message(reason))),
    ]);
    if (inFlight.current === signal) {
      inFlight.current = null;
      if (!signal.aborted) setRefreshing(false);
    }
  }, [queryClient]);

  useEffect(() => {
    const session = startMonitorPolling(active, load, () => setNow(Date.now()));
    polling.current = session;
    return () => { session.stop(); polling.current = null; };
  }, [active, load]);

  const rows = useMemo(() => {
    const jobs = status?.jobs ?? [];
    return [...jobs].sort((x, y) => {
      const gx = GROUP_ORDER.indexOf(x.jobKey.split(':')[0]);
      const gy = GROUP_ORDER.indexOf(y.jobKey.split(':')[0]);
      if (gx !== gy) return (gx < 0 ? 99 : gx) - (gy < 0 ? 99 : gy);
      return x.jobKey.localeCompare(y.jobKey);
    });
  }, [status]);

  const failing = rows.filter((j) => j.lastStatus === 'FAILED' || j.lastStatus === 'TIMEOUT').length;
  const healthy = rows.filter((j) => j.lastStatus === 'OK').length;
  const heartbeat = status?.heartbeatAgeSeconds == null ? null
    : status.heartbeatAgeSeconds + Math.max(0, Math.floor((now - (workerUpdatedAt ?? now)) / 1000));
  const unavailable = error ? (status ? 'stale' : 'unavailable') : 'loading';

  return (
    <div className="operations-page">
      {/* Header */}
      <div className="operations-heading">
        <div>
          <p className="workspace-kicker">Observe · decide · direct</p>
          <h1 className="workspace-title">Operations monitor<span className="text-primary">.</span></h1>
          <p className="workspace-description">
            Worker health, scheduled jobs, and the work in motion.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.projects, refetchType: 'none' })
                .then(() => polling.current?.refresh());
            }}
            disabled={refreshing}
            className="workspace-button workspace-button-secondary"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} aria-hidden />{refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={onOpenConversation}
            className="workspace-button workspace-button-primary"
          >
            New conversation <ArrowUpRight size={16} aria-hidden />
          </button>

        </div>
      </div>

      {/* Status strip — hairline separated, mono numbers */}
      <dl className="operations-metrics">
        <Metric
          label={error && status ? 'Worker · stale' : 'Worker heartbeat'}
          value={!status ? unavailable : heartbeat === null ? 'no heartbeat' : heartbeat < 60 ? (error ? `${heartbeat}s ago` : `live · ${heartbeat}s`) : `${Math.round(heartbeat / 60)}m behind`}
          tone={error && status ? 'warn' : !status ? 'plain' : heartbeat === null ? 'bad' : heartbeat < 300 ? 'good' : 'warn'}
        />
        <Metric label="Successful last runs" value={status ? `${healthy}/${rows.length}` : '—'} tone={status && !error ? (failing > 0 ? 'warn' : 'good') : 'plain'} />
        <Metric label="Needs attention" value={status ? String(failing) : '—'} tone={failing > 0 ? 'bad' : 'plain'} />
        <Metric
          label="Next cycle"
          value={rows.length ? until(rows.filter((r) => r.nextRunAt).map((r) => r.nextRunAt!).sort()[0] ?? null, now) : '—'}
          tone="plain"
        />
      </dl>

      {error && (
        <p role="status" className="mt-4 border-l-2 border-[hsl(var(--denial))] pl-3 font-mono text-xs text-[hsl(var(--denial))]">{error}{status ? ' Showing last known worker data.' : ''}</p>
      )}

      {/* Attention — what needs a decision today */}
      <section aria-label="Attention" className="workspace-panel operations-projects">
        <div className="workspace-section-heading">
          <h2 className="workspace-section-title">
            Active projects
          </h2>
          <Link
            href="/dashboard/projects"
            className="workspace-text-link"
          >
            All projects <ArrowUpRight size={14} aria-hidden />
          </Link>
        </div>
        {projectsError && <ResourceError message={projectsError} stale={projects !== null} />}
        {projects === null && projectsError ? null : projects === null ? (
          <div className="divide-y divide-border/60 border-b border-border/60">
            {[0, 1].map((i) => (
              <div key={i} className="py-3">
                <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
              </div>
            ))}
          </div>
        ) : projects.filter((p) => p.status === 'ACTIVE').length === 0 ? (
          <p className="border-b border-border/60 py-4 font-mono text-xs text-muted-foreground">
            No active projects.{' '}
            <Link href="/dashboard/projects" className="underline decoration-border underline-offset-4 hover:text-foreground">
              Create one
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-border/60 border-b border-border/60">
            {projects
              .filter((p) => p.status === 'ACTIVE')
              .slice(0, 5)
              .map((p) => {
                const sid = subsidiaryIdOf(p);
                const pct = typeof p.progress?.percent === 'number' ? Math.max(0, Math.min(100, Math.round(p.progress.percent))) : null;
                return (
                  <li key={p.id}>
                    <Link
                      href={projectReportHref(p.id, sid)}
                      className="operations-project-row"
                    >
                      <span className="operations-project-identity">
                        <span className="break-words text-sm leading-relaxed text-foreground">{p.name}</span>
                        <SubsidiaryChip id={sid} />
                      </span>
                      <span className="operations-project-progress">
                        <span className="flex items-center justify-between gap-4 text-xs text-muted-foreground"><span>{pct === null ? 'Progress unavailable' : `${pct}% complete`}</span><span>{p.openTaskCount === undefined ? 'Task count unavailable' : `${p.openTaskCount} open`}</span></span>
                        {pct !== null && <span className="operations-progress-track" role="progressbar" aria-label={`${p.name} progress`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${pct}%`}} /></span>}
                      </span><ArrowUpRight size={17} className="hidden shrink-0 text-muted-foreground sm:block" aria-hidden />
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <div className="operations-grid">
        {/* Agent roster table */}
        <section aria-label="Agent roster" className="workspace-panel min-w-0">
          <div className="workspace-section-heading"><div><p className="workspace-kicker">Execution</p><h2 className="workspace-section-title">Scheduled work</h2></div><span className="workspace-count">{status ? rows.length : '—'} jobs</span></div>
          <table className="operations-table w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-border font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="w-[45%] py-3 pr-3 font-normal sm:w-auto">Agent</th>
                <th className="hidden py-2 pr-3 font-normal sm:table-cell">Last run</th>
                <th className="w-[25%] py-3 pr-2 font-normal sm:w-auto">Next</th>
                <th className="hidden py-2 pr-3 text-right font-normal md:table-cell">Runs</th>
                <th className="w-[30%] py-3 text-right font-normal sm:w-auto">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center font-mono text-xs text-muted-foreground">
                    {error ? 'Worker data unavailable.' : status ? 'No scheduled jobs yet.' : 'Loading…'}
                  </td>
                </tr>
              )}
              {rows.map((job, i) => {
                const { name, sub } = rowName(job.jobKey);
                return (
                  <motion.tr
                    key={job.jobKey}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i, 12) * 0.015 }}
                    className="border-b border-border/60 transition-colors hover:bg-secondary/40"
                  >
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(job.lastStatus)}`} aria-hidden />
                        <span className="break-words text-sm text-foreground">{name}</span>
                      </div>
                      <span className="ml-4 block font-mono text-[11px] text-muted-foreground">{sub}</span>
                    </td>
                    <td className="hidden py-2.5 pr-3 font-mono text-xs tabular-nums text-muted-foreground sm:table-cell">
                      {relative(job.lastRunAt, now)}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted-foreground">{until(job.nextRunAt, now)}</td>
                    <td className="hidden py-2.5 pr-3 text-right font-mono text-xs tabular-nums text-muted-foreground md:table-cell">
                      {job.runs}
                    </td>
                    <td className={`py-2.5 text-right font-mono text-[11px] uppercase tracking-wider ${statusTone(job.lastStatus)}`}>
                      {job.lastStatus ?? 'pending'}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Right rail — activity */}
        <aside aria-label="Recent activity" className="workspace-panel min-w-0">
          <div className="workspace-section-heading"><div><p className="workspace-kicker">Audit trail</p><h2 className="workspace-section-title">Recent activity</h2></div><ShieldCheck size={18} className="text-muted-foreground" aria-hidden /></div>
          <ul className="operations-activity-list">
            {activityError && <li><ResourceError message={activityError} stale={activity !== null} /></li>}
            {activity === null && !activityError && (
              <>
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="py-3">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
                  </li>
                ))}
              </>
            )}
            {activity?.length === 0 && (
              <li className="py-6 font-mono text-xs text-muted-foreground">No recorded actions yet. Start a conversation.</li>
            )}
            {activity?.map((a) => (
              <li key={a.id} className="operations-activity-row">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    a.status === 'FAILED' || a.status === 'DENIED'
                      ? 'bg-[hsl(var(--denial))]'
                      : a.status === 'VALIDATED'
                        ? 'bg-[hsl(var(--whink-accent))]'
                        : 'bg-muted-foreground/40'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-mono text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]">{a.action}</p>
                  <p className="mt-2 text-xs text-muted-foreground"><span className="mr-2">{a.status}</span>
                    {a.persona ? `${a.persona} · ` : ''}
                    {relative(a.createdAt, now)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="operations-learning">
            <h2 className="workspace-section-title">Self-improvement</h2>
            {(() => {
              const m = rows.find((r) => r.jobKey.startsWith('self_improvement'));
              return (
                <dl className="mt-3 space-y-1.5 border-y border-border py-3 font-mono text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">last cycle</dt>
                    <dd className="tabular-nums text-foreground">{status ? relative(m?.lastRunAt ?? null, now) : '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">cycles</dt>
                    <dd className="tabular-nums text-foreground">{m?.runs ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">state</dt>
                    <dd className={statusTone(m?.lastStatus ?? null)}>{status ? m?.lastStatus ?? 'not scheduled' : 'unavailable'}</dd>
                  </div>
                </dl>
              );
            })()}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'plain' }) {
  const toneClass =
    tone === 'good'
      ? 'text-[hsl(var(--whink-accent))]'
      : tone === 'warn'
        ? 'text-[hsl(var(--pending-amber))]'
        : tone === 'bad'
          ? 'text-[hsl(var(--denial))]'
          : 'text-foreground';
  return (
    <div className={`operations-stat operations-stat-${tone}`}>
      <dt className="operations-stat-label">{label}</dt>
      <dd className={`operations-stat-value ${toneClass}`}>{value}</dd>
    </div>
  );
}
function ResourceError({ message, stale }: { message: string; stale: boolean }) {
  return <p role="status" className="border-l-2 border-[hsl(var(--denial))] py-3 pl-3 text-sm text-muted-foreground">
    {message} {stale ? 'Showing last known data.' : 'Data unavailable.'}
  </p>;
}

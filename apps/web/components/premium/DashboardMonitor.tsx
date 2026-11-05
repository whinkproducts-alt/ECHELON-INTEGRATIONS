'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { PERSONAS, type PersonaType } from '@/lib/personas';
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
  onOpenBoard,
}: {
  onOpenConversation: () => void;
  onOpenBoard: () => void;
}) {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [s, a, p] = await Promise.all([
        fetch('/api/worker/status', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('worker status')))),
        fetch('/api/ledger?limit=15', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
        fetch('/api/projects', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ]);
      setStatus(s as WorkerStatus);
      setActivity(Array.isArray(a) ? (a as ActivityRow[]) : []);
      setProjects(Array.isArray(p) ? (p as ProjectSummary[]) : []);
      setError(null);
    } catch {
      setError('Could not load worker status.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled) void load(); };
    const kick = setTimeout(run, 0);
    const poll = setInterval(run, 30_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearTimeout(kick);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

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
  const heartbeat = status?.heartbeatAgeSeconds ?? null;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-6 sm:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Operations</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {status ? `${status.enabledCount} agents enabled · roster ${status.rosterSize}` : 'loading roster…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onOpenConversation}
            className="rounded-md bg-primary px-3 py-1.5 font-mono text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            New conversation
          </button>
          <button
            type="button"
            onClick={onOpenBoard}
            className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Board
          </button>
        </div>
      </div>

      {/* Status strip — hairline separated, mono numbers */}
      <dl className="mt-6 grid grid-cols-2 divide-x divide-border border-y border-border sm:grid-cols-4">
        <Metric
          label="Worker"
          value={heartbeat === null ? 'no heartbeat' : heartbeat < 60 ? `live · ${heartbeat}s` : `${Math.round(heartbeat / 60)}m behind`}
          tone={heartbeat === null ? 'bad' : heartbeat < 300 ? 'good' : 'warn'}
        />
        <Metric label="Healthy" value={`${healthy}/${rows.length || '—'}`} tone={failing > 0 ? 'warn' : 'good'} />
        <Metric label="Failures" value={String(failing)} tone={failing > 0 ? 'bad' : 'plain'} />
        <Metric
          label="Next cycle"
          value={rows.length ? until(rows.filter((r) => r.nextRunAt).map((r) => r.nextRunAt!).sort()[0] ?? null, now) : '—'}
          tone="plain"
        />
      </dl>

      {error && (
        <p className="mt-4 border-l-2 border-[hsl(var(--denial))] pl-3 font-mono text-xs text-[hsl(var(--denial))]">{error}</p>
      )}

      {/* Attention — what needs a decision today */}
      <section aria-label="Attention" className="mt-8">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            What requires your attention
          </h2>
          <Link
            href="/dashboard/projects"
            className="font-mono text-[11px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
          >
            All projects
          </Link>
        </div>
        {projects === null ? (
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
                const pct = Math.max(0, Math.min(100, Math.round(p.progress?.percent ?? 0)));
                return (
                  <li key={p.id}>
                    <Link
                      href={projectReportHref(p.id, sid)}
                      className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-secondary/40"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm text-foreground">{p.name}</span>
                        <SubsidiaryChip id={sid} />
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {pct}% · {p.openTaskCount ?? 0} open
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Agent roster table */}
        <section aria-label="Agent roster">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Research team</h2>
          <table className="mt-3 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Agent</th>
                <th className="hidden py-2 pr-3 font-normal sm:table-cell">Last run</th>
                <th className="py-2 pr-3 font-normal">Next</th>
                <th className="hidden py-2 pr-3 text-right font-normal md:table-cell">Runs</th>
                <th className="py-2 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="py-10 text-center font-mono text-xs text-muted-foreground">
                    {status ? 'No scheduled jobs yet.' : 'Loading…'}
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
                        <span className="truncate text-sm text-foreground">{name}</span>
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
        <aside aria-label="Recent activity">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Activity</h2>
          <ul className="mt-3 divide-y divide-border/60 border-y border-border">
            {activity === null && (
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
              <li key={a.id} className="flex items-start gap-2.5 py-2.5">
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
                  <p className="truncate font-mono text-xs text-foreground">{a.action}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {a.persona ? `${a.persona} · ` : ''}
                    {relative(a.createdAt, now)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Self-improvement</h2>
            {(() => {
              const m = rows.find((r) => r.jobKey.startsWith('self_improvement'));
              return (
                <dl className="mt-3 space-y-1.5 border-y border-border py-3 font-mono text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">last cycle</dt>
                    <dd className="tabular-nums text-foreground">{relative(m?.lastRunAt ?? null, now)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">cycles</dt>
                    <dd className="tabular-nums text-foreground">{m?.runs ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">state</dt>
                    <dd className={statusTone(m?.lastStatus ?? null)}>{m?.lastStatus ?? 'pending'}</dd>
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
    <div className="px-4 py-3 first:pl-0">
      <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-mono text-sm tabular-nums ${toneClass}`}>{value}</dd>
    </div>
  );
}
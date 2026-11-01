'use client';
// Swarm Control: compose an initiative, plan it (POST /api/swarm), review plan and estimate, start explicitly.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Network, RefreshCw, Sparkles } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloHeading, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { SafeDate } from '@/components/safe-format';
import { getSubsidiaryList } from '@/components/subsidiaries';
import { useJson } from '@/components/screens/usage/use-json';
import { PlanPanel } from './plan-panel';
import { RUN_STATUS } from './status';
import { usePolledJson } from './use-polled-json';
import { fmtCompact, isLive, type PlanResponse, type ProjectOption, type RunView } from './types';

const MAX_TEXT = 4000;
const MIN_AGENTS = 50;
const MAX_AGENTS = 120;
const FIELD = 'w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function Composer({ onPlanned }: { onPlanned: (p: PlanResponse) => void }) {
  const [text, setText] = React.useState('');
  const [projectId, setProjectId] = React.useState('');
  const [subsidiary, setSubsidiary] = React.useState('');
  const [agents, setAgents] = React.useState(MIN_AGENTS);
  const [planning, setPlanning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ids = { text: React.useId(), project: React.useId(), sub: React.useId(), agents: React.useId() };
  const projects = useJson<ProjectOption[]>('/api/projects');
  const subs = getSubsidiaryList();
  const projectList = Array.isArray(projects.data) ? projects.data : [];
  const tooLong = text.length > MAX_TEXT;
  const canPlan = text.trim().length > 0 && !tooLong && !planning;

  const plan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPlan) return;
    setPlanning(true);
    setError(null);
    const payload: Record<string, unknown> = { initiative: text.trim(), minAgents: agents };
    if (projectId) payload.projectId = projectId;
    if (subsidiary) payload.subsidiary = subsidiary;
    fetch('/api/swarm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(async (r) => {
        let body: Partial<PlanResponse> & { error?: string; code?: string } = {};
        try { body = (await r.json()) as typeof body; } catch { body = {}; }
        if (r.ok && body.run && Array.isArray(body.tasks) && body.budget) { onPlanned(body as PlanResponse); return; }
        setError(
          body.code === 'budget_hard_limit' ? 'Your monthly token budget is at its hard limit, so no new swarm can be planned.'
          : r.status === 502 ? 'No plan could be made. The planning model is unavailable or returned nothing usable. Check that a model is configured, then try again.'
          : r.status === 404 ? 'That project was not found.'
          : r.status === 429 ? 'Too many requests. Wait a moment and try again.'
          : r.status === 409 ? (body.error ?? 'Not enough agents available for this size.')
          : r.status === 401 ? 'Sign in again to plan a swarm.'
          : (body.error ?? `Planning failed (${r.status}).`),
        );
      })
      .catch(() => setError('Network error. Nothing was planned.'))
      .then(() => setPlanning(false));
  };

  return (
    <HoloPanel as="section" tone="accent" aria-label="Plan a swarm" className="space-y-5">
      <form onSubmit={plan} className="space-y-5" aria-busy={planning}>
        <div className="space-y-2">
          <label htmlFor={ids.text} className="font-display text-lg font-semibold text-foreground">Initiative</label>
          <textarea id={ids.text} value={text} onChange={(e) => setText(e.target.value)} rows={5} required maxLength={MAX_TEXT + 500}
            placeholder="Describe the outcome you want. The swarm splits it into lanes and assigns real agents."
            aria-describedby={`${ids.text}-count`} aria-invalid={tooLong || undefined} className={FIELD} />
          <p id={`${ids.text}-count`} className="text-right font-mono text-xs text-muted-foreground">
            <span className={tooLong ? 'text-foreground underline' : undefined}>{text.length}</span> / {MAX_TEXT}{tooLong ? ' (too long)' : ''}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={ids.project} className="text-sm text-muted-foreground">Project (optional)</label>
            <select id={ids.project} value={projectId} onChange={(e) => setProjectId(e.target.value)} className={FIELD} disabled={projects.loading}>
              <option value="">{projects.loading ? 'Loading projects...' : 'No project'}</option>
              {projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!projects.loading && projects.status !== 200 && <p className="text-xs text-muted-foreground">Projects could not be loaded. You can still plan without one.</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.sub} className="text-sm text-muted-foreground">Subsidiary (optional)</label>
            <select id={ids.sub} value={subsidiary} onChange={(e) => setSubsidiary(e.target.value)} className={FIELD}>
              <option value="">None</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.agents} className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
            <span>Agents</span><span className="font-mono text-lg tabular-nums text-foreground">{agents}</span>
          </label>
          <input id={ids.agents} type="range" min={MIN_AGENTS} max={MAX_AGENTS} step={1} value={agents} onChange={(e) => setAgents(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
          <p className="text-xs text-muted-foreground">Between {MIN_AGENTS} and {MAX_AGENTS}. More agents means more lanes, more model calls and more tokens. You see the estimate before anything runs.</p>
        </div>

        {error && <p role="alert" className="rounded-md border border-border p-3 text-sm text-foreground">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <HoloButton type="submit" size="lg" loading={planning} disabled={!canPlan} leftIcon={<Sparkles className="h-4 w-4" aria-hidden />}>Plan swarm</HoloButton>
          <p className="text-xs text-muted-foreground">{planning ? 'Planning takes a model call. This can take a minute.' : 'Planning does not start the swarm.'}</p>
        </div>
      </form>
    </HoloPanel>
  );
}

function RunRow({ run }: { run: RunView }) {
  const s = RUN_STATUS[run.status] ?? RUN_STATUS.FAILED;
  return (
    <HoloPanel as="article" tone="deep" aria-label={`Swarm run ${run.title}`} className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="break-words font-display text-lg font-semibold tracking-tight text-foreground">{run.title}</h3>
        <p className="font-mono text-xs text-muted-foreground">
          {run.agents} agents · {fmtCompact(run.tokensUsed)} of about {fmtCompact(run.estimate.tokens)} tokens · <SafeDate date={run.createdAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize />
        </p>
      </div>
      <div className="flex items-center gap-3">
        <HoloBadge tone={s.tone} dot pulse={s.pulse}>{s.label}</HoloBadge>
        <HoloButton href={`/dashboard/swarm/${encodeURIComponent(run.id)}`} variant="ghost" size="sm" aria-label={`Open run ${run.title}`}>Open</HoloButton>
      </div>
    </HoloPanel>
  );
}

export function SwarmScreen() {
  const router = useRouter();
  const [plan, setPlan] = React.useState<PlanResponse | null>(null);
  const runs = usePolledJson<{ runs: RunView[] }>('/api/swarm', { intervalMs: 5000, shouldPoll: (d) => d.runs.some((r) => isLive(r.status)) });
  const list = runs.data?.runs ?? [];

  const body = (() => {
    if (runs.loading) return <div role="status" aria-busy="true"><span className="sr-only">Loading runs</span><HoloPanel tone="deep" edge={false} className="h-24 animate-pulse" aria-hidden><div className="h-full rounded bg-secondary" /></HoloPanel></div>;
    if (runs.status === 401) return <HoloEmpty state="error" title="Sign in to see swarm runs" action={<HoloButton href="/login" size="sm">Sign in</HoloButton>} />;
    if (runs.status !== 200 || !runs.data) return <HoloEmpty state="error" title="Runs did not load" description="The server did not return your swarm runs." action={<HoloButton size="sm" onClick={runs.reload}>Try again</HoloButton>} />;
    if (list.length === 0) return <HoloEmpty icon={<Network className="h-6 w-6" aria-hidden />} title="No swarm runs yet" description="Plan one above. Nothing runs until you press Start." />;
    return <ul className="space-y-3" aria-label="Swarm runs">{list.map((r) => <li key={r.id}><RunRow run={r} /></li>)}</ul>;
  })();

  return (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={50} />
      <div className="relative mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
        <HoloHeading eyebrow="Operations" title="Swarm Control"
          description="Fifty to a hundred and twenty agents on one initiative. You plan, you see the estimate, and you press Start."
          actions={<HoloButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={runs.reload} loading={runs.loading}>Refresh</HoloButton>} />

        <Composer onPlanned={setPlan} />

        {plan && (
          <section aria-label="Plan" className="space-y-4">
            <HoloHeading level={2} eyebrow="Plan ready" title="Review before you start" />
            <PlanPanel run={plan.run} tasks={plan.tasks} budget={plan.budget}
              onStarted={() => router.push(`/dashboard/swarm/${encodeURIComponent(plan.run.id)}`)} />
          </section>
        )}

        <section aria-label="Runs" className="space-y-4">
          <HoloHeading level={2} eyebrow="History" title="Runs" tone="deep" />
          {runs.stale && <p role="status" className="text-xs text-muted-foreground">Live updates are paused after a failed refresh.</p>}
          {body}
        </section>
      </div>
    </div>
  );
}


'use client';
// The plan, the estimate and the single Start button. Clicking Start is the approval for time and tokens, and says so.
// Amber appears only through the limit meter, and only when the response flags the budget amber or red.
import * as React from 'react';
import { Play } from 'lucide-react';
import { HoloBadge, HoloButton, HoloGrid, HoloHeading, HoloMeter, HoloPanel } from '@/components/ui/holo';
import { PersonaAvatar } from '@/components/ui/persona-avatar';
import { ROLE_META, ROLE_ORDER, fmtCompact, fmtEta, fmtInt, type BudgetFlag, type Estimate, type PlanTask, type RunView, type SwarmRole } from './types';

export function RoleMix({ roles, total }: { roles: Record<string, number>; total: number }) {
  return (
    <ul aria-label="Role mix" className="flex flex-wrap gap-2">
      {ROLE_ORDER.filter((r) => (roles[r] ?? 0) > 0).map((r) => (
        <li key={r}><HoloBadge tone={ROLE_META[r].tone}>{roles[r]} {roles[r] === 1 ? ROLE_META[r].label.toLowerCase() : ROLE_META[r].plural.toLowerCase()}</HoloBadge></li>
      ))}
      <li className="self-center font-mono text-xs text-muted-foreground">{total} agents in all</li>
    </ul>
  );
}

function EstimatePanel({ e, budget }: { e: Estimate; budget: BudgetFlag | null }) {
  const flagged = budget && budget.flag !== 'none' && budget.limit !== null;
  return (
    <HoloPanel tone={flagged ? 'amber' : 'deep'} glow={flagged ? 'soft' : 'none'} aria-label="Estimate" className="space-y-4">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.25em] text-muted-foreground">Estimate before you start</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {([
          ['Agents', fmtInt(e.agents)],
          ['Work packages', fmtInt(e.workPackages)],
          ['Expected model calls', fmtInt(e.expectedCalls)],
          ['Most model calls', fmtInt(e.maxCalls)],
          ['Estimated tokens', fmtCompact(e.tokens)],
          ['Estimated time', fmtEta(e.etaSeconds)],
        ] as const).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-mono text-lg tabular-nums text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        {fmtCompact(e.tokensIn)} tokens in, {fmtCompact(e.tokensOut)} out, {e.concurrency} agents at a time, {e.criticalPath} steps on the longest chain. Figures are estimates, not a bill.
      </p>
      {budget === null ? (
        <p className="text-xs text-muted-foreground">The budget check runs when you press Start. A run that would pass the hard limit is refused.</p>
      ) : budget.limit === null ? (
        <p className="text-xs text-muted-foreground">No monthly token budget is set, so nothing here is capped.</p>
      ) : flagged ? (
        <div className="space-y-2">
          <HoloMeter limit value={budget.used + budget.estimatedTokens} max={budget.limit}
            label={budget.flag === 'red' ? 'Budget after this run: over the hard limit' : 'Budget after this run: past the soft limit'}
            valueText={`${fmtCompact(budget.used + budget.estimatedTokens)} of ${fmtCompact(budget.limit)} tokens`} />
          <p className="text-sm text-foreground">
            {budget.flag === 'red' ? 'This run would pass your hard token limit, so it cannot start.' : 'This run would take you past your soft token limit. It can still start.'}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Within your monthly token budget: {fmtCompact(budget.used)} used, this run adds about {fmtCompact(budget.estimatedTokens)}.</p>
      )}
    </HoloPanel>
  );
}

export function LaneGrid({ tasks }: { tasks: PlanTask[] }) {
  const groups = ROLE_ORDER.map((r) => ({ role: r, items: tasks.filter((t) => t.role === r) })).filter((g) => g.items.length > 0);
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <details key={g.role} open className="group">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 rounded-md py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <HoloBadge tone={ROLE_META[g.role].tone}>{ROLE_META[g.role].plural}: {g.items.length}</HoloBadge>
            <span className="text-sm text-muted-foreground">{ROLE_META[g.role].blurb}</span>
          </summary>
          <HoloGrid min="15rem" gap="0.75rem" as="ul" className="mt-3">
            {g.items.map((t) => <li key={t.lane}><LaneCard task={t} role={g.role} /></li>)}
          </HoloGrid>
        </details>
      ))}
    </div>
  );
}

function LaneCard({ task, role }: { task: PlanTask; role: SwarmRole }) {
  const name = task.agentName ?? 'Agent';
  return (
    <HoloPanel tone={ROLE_META[role].tone} edge={false} padded={false} className="p-3">
      <div className="flex items-start gap-3">
        <PersonaAvatar name={name} size="sm" />
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-foreground">{name}</p>
          <p className="break-words text-xs text-muted-foreground">{task.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.6875rem] text-muted-foreground">{task.lane}</span>
            <HoloBadge tone="neutral">{task.fit === 'matched' ? 'Specialist' : 'Generalist'}</HoloBadge>
          </div>
        </div>
      </div>
    </HoloPanel>
  );
}

export function PlanPanel({ run, tasks, budget, onStarted }: { run: RunView; tasks: PlanTask[]; budget: BudgetFlag | null; onStarted: () => void }) {
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const blocked = budget !== null && (budget.flag === 'red' || budget.state === 'hard');

  const start = () => {
    setStarting(true);
    setError(null);
    fetch(`/api/swarm/${encodeURIComponent(run.id)}/start`, { method: 'POST' })
      .then(async (r) => {
        if (r.ok) { onStarted(); return; }
        let body: { error?: string; code?: string } = {};
        try { body = (await r.json()) as typeof body; } catch { body = {}; }
        setError(body.code === 'budget_hard_limit' ? 'Refused: this run would pass your hard token limit. Nothing was started.'
          : body.code === 'not_planned' ? 'This run was already started or cancelled.'
          : r.status === 429 ? 'Too many requests. Wait a moment and try again.'
          : (body.error ?? `Could not start (${r.status}). Nothing was started.`));
        setStarting(false);
      })
      .catch(() => { setError('Network error. Nothing was started.'); setStarting(false); });
  };

  return (
    <div className="space-y-6">
      <HoloPanel tone="accent" brackets className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="break-words font-display text-2xl font-semibold tracking-tight text-foreground">{run.title}</h2>
          <HoloBadge tone="amber" dot pulse>Awaiting your start</HoloBadge>
        </div>
        <RoleMix roles={run.estimate.roles} total={run.estimate.agents} />
        <p className="text-sm text-muted-foreground">Nothing has run yet. The plan costs only the single planning call already made.</p>
      </HoloPanel>

      <EstimatePanel e={run.estimate} budget={budget} />

      <HoloPanel tone="accent" className="space-y-3">
        <p className="text-sm text-foreground">
          Pressing Start is your approval. It commits the team size, the time and up to about {fmtCompact(run.tokenCap)} tokens (the cap for this run). The swarm stops by itself at that cap, and you can cancel at any time.
        </p>
        {blocked && <p role="status" className="text-sm text-foreground">Start is disabled because this run would pass your hard token limit. Raise the budget on the Usage screen or plan a smaller swarm.</p>}
        {error && <p role="alert" className="text-sm text-foreground">{error}</p>}
        <HoloButton size="lg" loading={starting} disabled={blocked} onClick={start} leftIcon={<Play className="h-4 w-4" aria-hidden />}>
          Start swarm
        </HoloButton>
      </HoloPanel>

      <section aria-label="Lanes" className="space-y-3">
        <HoloHeading level={2} eyebrow="Plan" title="Lanes and assigned agents" tone="deep" />
        <LaneGrid tasks={tasks} />
      </section>
    </div>
  );
}


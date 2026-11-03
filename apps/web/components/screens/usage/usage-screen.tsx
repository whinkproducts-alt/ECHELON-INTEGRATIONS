'use client';
// Usage & Offline. All figures come from GET /api/usage. Amber appears only when the budget
// soft or hard threshold is reached, always with the word "limit" beside it.
import * as React from 'react';
import { Gauge, WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloGrid, HoloHeading, HoloMeter, HoloOrbBackdrop, HoloPanel, HoloStat, HoloTabs, type HoloTone } from '@/components/ui/holo';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { useJson } from './use-json';
import { UsageChart, type DayPoint } from './usage-chart';
import { BudgetEditor } from './budget-editor';
import { countdown, fmtCompact, fmtInt, fmtUsd } from './format';

interface Budget { state: 'ok' | 'soft' | 'hard'; used: number; reserved: number; limit: number | null; softPct: number; hardPct: number; resetsAt: string }
interface ModelRow { model: string; provider: string; tokensIn: number; tokensOut: number; unknownCostCalls: number; costMicros: number; calls: number }
interface UsagePayload {
  range: '7d' | '30d';
  daily: (DayPoint & { unknownCostCalls: number; costMicros: number })[];
  byModel: ModelRow[];
  budget: Budget;
  connectivity: 'online' | 'degraded' | 'offline';
}

function useNow(): number | null {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return now;
}

const MODE: Record<UsagePayload['connectivity'], { label: string; tone: HoloTone; text: string }> = {
  online: { label: 'Online', tone: 'accent', text: 'Cloud models are reachable at normal speed.' },
  degraded: { label: 'Degraded', tone: 'ember', text: 'A cloud model is slow or only partly reachable. Replies may lag.' },
  offline: { label: 'Offline', tone: 'ember', text: 'No cloud model is reachable right now.' },
};

function Connectivity({ mode, budgetState }: { mode: UsagePayload['connectivity']; budgetState: Budget['state'] }) {
  const { productName } = useTenantConfig();
  const m = MODE[mode] ?? MODE.online;
  const Icon = mode === 'offline' ? WifiOff : Wifi;
  return (
    <HoloPanel tone={m.tone} glow="soft" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Icon className="h-5 w-5" style={{ color: 'hsl(var(--holo-c))' }} aria-hidden />
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">Connectivity</h2>
        <HoloBadge tone={m.tone} dot pulse={mode !== 'online'}>{m.label}</HoloBadge>
      </div>
      <p className="text-sm text-foreground">{m.text}</p>
      <p className="text-sm text-muted-foreground">
        When fallback is switched on, {productName} moves to your local Ollama model automatically if the cloud is offline or your hard budget limit is reached. Each switch is written to the ledger with the reason. When the cloud returns and budget allows, it goes back.
      </p>
      <p className="font-mono text-xs text-muted-foreground">
        Fallback is controlled by the server setting WHINK_OFFLINE_FALLBACK. Whether it is on is configured on the server and is not reported here.
        {mode === 'offline' || budgetState === 'hard' ? ' Right now a fallback would apply if it is on and the local model is running.' : ''}
      </p>
    </HoloPanel>
  );
}

function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading usage</span>
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <HoloPanel tone="deep" edge={false} className="h-72 w-full animate-pulse lg:w-80" aria-hidden><div className="mx-auto mt-6 h-44 w-44 rounded-full bg-secondary" /></HoloPanel>
        <HoloPanel tone="deep" edge={false} className="h-72 animate-pulse" aria-hidden><div className="h-full rounded bg-secondary" /></HoloPanel>
      </div>
    </div>
  );
}

export function UsageScreen() {
  const { productName } = useTenantConfig();
  const [range, setRange] = React.useState<'7d' | '30d'>('7d');
  const [nonce, setNonce] = React.useState(0);
  const { loading, status, data } = useJson<UsagePayload>(`/api/usage?range=${range}`, nonce);
  const now = useNow();

  const body = (() => {
    if (loading) return <Loading />;
    if (status === 401) return <HoloEmpty state="error" title="Sign in to see usage" action={<HoloButton href="/login" size="sm">Sign in</HoloButton>} />;
    if (status !== 200 || !data || !Array.isArray(data.daily) || !data.budget) {
      return <HoloEmpty state="error" title="Usage did not load" description="The server did not return usage figures. Nothing has changed." action={<HoloButton size="sm" onClick={() => setNonce((n) => n + 1)}>Try again</HoloButton>} />;
    }
    const b = data.budget;
    const periodTokens = data.daily.reduce((a, d) => a + d.tokensIn + d.tokensOut, 0);
    const periodCost = data.daily.reduce((a, d) => a + d.costMicros, 0);
    const unknown = data.daily.reduce((a, d) => a + d.unknownCostCalls, 0);
    const calls = data.byModel.reduce((a, m) => a + m.calls, 0);
    const limited = b.state !== 'ok' && b.limit !== null;
    const committed = b.used + b.reserved;
    const pct = b.limit ? Math.round((committed / b.limit) * 100) : 0;
    const resets = now === null ? null : Math.max(0, Date.parse(b.resetsAt) - now);
    const maxModel = Math.max(1, ...data.byModel.map((m) => m.tokensIn + m.tokensOut));
    return (
      <div className="space-y-8">
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <HoloPanel tone={limited ? 'amber' : 'accent'} glow={limited ? 'soft' : 'none'} brackets className="flex flex-col items-center gap-4 text-center">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.25em] text-muted-foreground">Monthly token budget</p>
            {b.limit ? (
              <HoloMeter variant="arc" size={220} value={committed} max={b.limit} limit={limited} label={`${fmtInt(committed)} of ${fmtInt(b.limit)} tokens`} valueText={`${pct}%`} />
            ) : (
              <HoloMeter variant="arc" size={220} value={0} max={1} label={`${fmtInt(b.used)} tokens used`} valueText="No cap" />
            )}
            {b.reserved > 0 && <p className="text-sm text-muted-foreground">{fmtInt(b.used)} tokens recorded; {fmtInt(b.reserved)} held for unsettled attempts.</p>}
            {limited && (
              <HoloBadge tone="amber" dot pulse>{b.state === 'hard' ? 'Hard limit reached' : 'Soft limit reached'}</HoloBadge>
            )}
            <p className="text-sm text-muted-foreground">
              {b.limit === null ? 'No monthly budget is set. Usage is tracked but never capped.' : b.state === 'hard' ? `The budget is used up. If fallback is on, ${productName} now prefers the local model.` : b.state === 'soft' ? `Past your ${b.softPct}% soft threshold.` : `Soft threshold at ${b.softPct}%, hard at ${b.hardPct}%.`}
            </p>
            <p className="font-mono text-xs text-muted-foreground" aria-live="off">
              Resets in <span className="text-foreground tabular-nums">{resets === null ? '--' : countdown(resets)}</span>
              <span className="block">{b.resetsAt.slice(0, 10)} 00:00 UTC</span>
            </p>
          </HoloPanel>

          <HoloPanel tone="deep" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.25em] text-muted-foreground">Daily usage</p>
                <p className="font-display text-lg text-foreground">Tokens per day, last {data.daily.length} days</p>
              </div>
              <HoloTabs ariaLabel="Range" value={range} onValueChange={(v) => setRange(v === '30d' ? '30d' : '7d')} tabs={[{ id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }]} />
            </div>
            {periodTokens === 0 ? (
              <HoloEmpty icon={<Gauge className="h-6 w-6" aria-hidden />} title="No usage in this range" description={`Once ${productName} talks to a model, daily tokens appear here.`} />
            ) : (
              <UsageChart daily={data.daily} />
            )}
          </HoloPanel>
        </div>

        <HoloGrid fit min="12rem">
          <HoloStat label={`Tokens, ${range}`} value={periodTokens} format={(n) => fmtCompact(n)} tone="accent" />
          <HoloStat label="Tokens this month" value={b.used} format={(n) => fmtCompact(n)} tone="deep" />
          <HoloPanel tone="neutral">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Cost estimate, {range}</p>
            <p className="mt-2 font-mono text-3xl tabular-nums text-foreground">{unknown && calls === unknown ? 'Unknown' : fmtUsd(periodCost)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{unknown ? `Excludes ${fmtInt(unknown)} calls with unknown cost.` : 'Estimated from configured prices.'}</p>
          </HoloPanel>
        </HoloGrid>

        <section aria-label="Usage by model" className="space-y-3">
          <HoloHeading level={2} eyebrow="Split" title="By model and provider" tone="deep" />
          {data.byModel.length === 0 ? (
            <HoloEmpty title="No model activity" description="Models appear here after their first call in this range." />
          ) : (
            <HoloPanel tone="deep" className="space-y-4">
              {data.byModel.map((m) => (
                <HoloMeter
                  key={`${m.provider}/${m.model}`} value={m.tokensIn + m.tokensOut} max={maxModel}
                  label={`${m.model} (${m.provider})`} valueText={`${fmtCompact(m.tokensIn + m.tokensOut)} tokens · ${fmtInt(m.calls)} calls${m.unknownCostCalls < m.calls ? ` · ${fmtUsd(m.costMicros)}` : ''}${m.unknownCostCalls ? ` · ${m.unknownCostCalls} unpriced` : ''}`}
                />
              ))}
            </HoloPanel>
          )}
        </section>

        <Connectivity mode={data.connectivity} budgetState={b.state} />

        <BudgetEditor
          key={`${b.limit}-${b.softPct}-${b.hardPct}`}
          initial={{ limit: b.limit, softPct: b.softPct, hardPct: b.hardPct }}
          onSaved={() => setNonce((n) => n + 1)}
        />
      </div>
    );
  })();

  return (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={50} />
      <div className="relative mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
        <HoloHeading
          eyebrow="Operations"
          title="Usage & Offline"
          description={`What ${productName} has spent, what is left, and what happens when the cloud or the budget runs out.`}
          actions={<HoloButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={() => setNonce((n) => n + 1)} loading={loading}>Refresh</HoloButton>}
        />
        {body}
      </div>
    </div>
  );
}

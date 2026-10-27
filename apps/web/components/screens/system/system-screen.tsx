'use client';
// System Health. Facts from GET /api/system/health (lib/system-health.ts). A tile never shows a success
// mark unless the check reported ok: "not configured" and "unknown" are neutral and say so in words.
// "Last checked" is the client time the answer arrived; the server caches answers for 10 seconds.
import * as React from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, CircleSlash, RefreshCw, XCircle, type LucideIcon } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloGrid, HoloHeading, HoloOrbBackdrop, HoloPanel, type HoloTone } from '@/components/ui/holo';
import { fmtUptime, humanize } from '@/components/screens/ledger/format';
import { useJson } from '@/components/screens/ledger/use-json';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';

type Health = 'ok' | 'degraded' | 'down' | 'not_configured' | 'unknown';
interface Probe { status?: string; latencyMs?: number; detail?: string; [k: string]: unknown }
interface HealthPayload {
  scope?: 'operator' | 'user';
  checkedAt?: string;
  uptimeSec?: number;
  version?: string | null;
  checks?: Record<string, Probe>;
}

const STATE: Record<Health, { tone: HoloTone; label: string; Icon: LucideIcon }> = {
  ok: { tone: 'accent', label: 'OK', Icon: CheckCircle2 },
  degraded: { tone: 'ember', label: 'Degraded', Icon: AlertTriangle },
  down: { tone: 'ember', label: 'Down', Icon: XCircle },
  not_configured: { tone: 'neutral', label: 'Not configured', Icon: CircleSlash },
  unknown: { tone: 'neutral', label: 'Unknown', Icon: CircleHelp },
};
function normalise(s: unknown): Health {
  return s === 'ok' || s === 'degraded' || s === 'down' || s === 'not_configured' ? s : 'unknown';
}

const TILES: Array<{ key: string; title: string; what: string; notConfigured?: string }> = [
  { key: 'database', title: 'Database', what: 'Stores memory, the ledger and approvals.' },
  { key: 'modelProviders', title: 'Model providers', what: 'Cloud models that have credentials set.', notConfigured: 'No cloud model has credentials. Add a provider key on the server, or rely on a local model.' },
  { key: 'localModel', title: 'Local model', what: 'Your own model server on this machine.', notConfigured: 'Set OLLAMA_URL on the server to use a local model.' },
  { key: 'gateway', title: 'Tool gateway', what: 'Connects outside tools through MCP.', notConfigured: 'No gateway is configured, so outside tools are unavailable.' },
  { key: 'recall', title: 'Document recall', what: 'Searches your uploaded documents.', notConfigured: 'No recall service is configured, so documents cannot be searched.' },
  { key: 'worker', title: 'Background worker', what: 'Runs scheduled and long tasks.' },
  { key: 'migrations', title: 'Migrations', what: 'Database changes applied versus shipped.' },
];

const EXTRA_LABEL: Record<string, string> = {
  providers: 'Providers', toolCount: 'Tools', lastHeartbeatAgeSec: 'Last heartbeat', applied: 'Applied', onDisk: 'Shipped', pending: 'Pending',
};

function extras(p: Probe): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(p)) {
    if (k === 'status' || k === 'latencyMs' || k === 'detail') continue;
    let text: string | null = null;
    if (typeof v === 'number') text = k === 'lastHeartbeatAgeSec' ? `${fmtUptime(v)} ago` : String(v);
    else if (typeof v === 'string') text = v.slice(0, 120);
    else if (Array.isArray(v)) text = v.filter((x): x is string => typeof x === 'string').slice(0, 12).join(', ') || 'none';
    if (text !== null) out.push([EXTRA_LABEL[k] ?? humanize(k), text]);
    if (out.length >= 6) break;
  }
  return out;
}

function Tile({ title, what, probe, notConfigured }: { title: string; what: string; probe: Probe | undefined; notConfigured?: string }) {
  const h = normalise(probe?.status);
  const s = STATE[h];
  const detail = typeof probe?.detail === 'string' ? probe.detail.slice(0, 200) : null;
  const rows = probe ? extras(probe) : [];
  return (
    <HoloPanel tone={s.tone} as="article" aria-label={`${title}: ${s.label}`} className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
        <HoloBadge tone={s.tone}><s.Icon className="mr-1 h-3.5 w-3.5" aria-hidden />{s.label}</HoloBadge>
      </div>
      <p className="text-xs text-muted-foreground">{what}</p>
      {h === 'not_configured' && notConfigured && <p className="text-sm text-foreground">{notConfigured}</p>}
      {h === 'unknown' && !detail && <p className="text-sm text-foreground">This check could not tell. It is not counted as healthy.</p>}
      {detail && <p className="break-words text-sm text-foreground">{detail}</p>}
      {rows.length > 0 && (
        <dl className="space-y-0.5 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="break-words text-right font-mono text-foreground">{v}</dd></div>
          ))}
        </dl>
      )}
      <p className="mt-auto font-mono text-xs text-muted-foreground">
        Latency <span className="text-foreground tabular-nums">{typeof probe?.latencyMs === 'number' ? `${Math.round(probe.latencyMs)} ms` : '--'}</span>
      </p>
    </HoloPanel>
  );
}

function Summary({ checks }: { checks: Array<Probe | undefined> }) {
  const counts: Record<Health, number> = { ok: 0, degraded: 0, down: 0, not_configured: 0, unknown: 0 };
  for (const c of checks) counts[normalise(c?.status)]++;
  const bad = counts.degraded + counts.down;
  const allOk = counts.ok === checks.length && checks.length > 0;
  const tone: HoloTone = bad > 0 ? 'ember' : allOk ? 'accent' : 'neutral';
  const text = allOk ? 'All checks passed.'
    : bad > 0 ? `${bad} ${bad === 1 ? 'check needs' : 'checks need'} attention.`
    : 'No check has failed, but some are not configured or could not be confirmed.';
  return (
    <HoloPanel tone={tone} glow="soft" role="status" aria-live="polite" className="flex flex-wrap items-center gap-3">
      <HoloBadge tone={tone}>{allOk ? 'All OK' : bad > 0 ? 'Needs attention' : 'Not fully confirmed'}</HoloBadge>
      <p className="text-sm text-foreground">{text}</p>
      <p className="font-mono text-xs text-muted-foreground">
        {counts.ok} ok, {counts.degraded} degraded, {counts.down} down, {counts.not_configured} not configured, {counts.unknown} unknown
      </p>
    </HoloPanel>
  );
}

export function SystemScreen() {
  const { productName } = useTenantConfig();
  const [nonce, setNonce] = React.useState(0);
  const { loading, status, data, at } = useJson<HealthPayload>('/api/system/health', nonce);
  const lastChecked = at === null ? null : new Date(at).toLocaleTimeString('en-CA', { hour12: false });

  const body = (() => {
    if (loading) return <HoloEmpty state="loading" title="Running checks" description="Each check has a short timeout, so this takes a moment at most." />;
    if (status === 401) return <HoloEmpty state="error" title="Sign in to see system health" action={<HoloButton size="sm" href="/login">Sign in</HoloButton>} />;
    if (status !== 200 || !data || !data.checks || typeof data.checks !== 'object') {
      return <HoloEmpty state="error" title="Health did not load" description="The server did not return its checks. That is not the same as everything being fine."
        action={<HoloButton size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>Try again</HoloButton>} />;
    }
    const operator = data.scope === 'operator';
    const tiles = operator ? TILES : TILES.filter((t) => t.key === 'database');
    const checks = tiles.map((t) => data.checks?.[t.key]);
    return (
      <div className="space-y-6">
        <Summary checks={checks} />
        {!operator && (
          <p className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            Operator checks (models, gateway, recall, worker, migrations) are visible to the owner account only. You see whether the service answers.
          </p>
        )}
        <HoloGrid fit min="16rem">
          {tiles.map((t) => <Tile key={t.key} title={t.title} what={t.what} notConfigured={t.notConfigured} probe={data.checks?.[t.key]} />)}
        </HoloGrid>
        {operator && (
          <dl className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-muted-foreground">
            <div><dt className="inline">Uptime </dt><dd className="inline text-foreground">{typeof data.uptimeSec === 'number' ? fmtUptime(data.uptimeSec) : '--'}</dd></div>
            <div><dt className="inline">Version </dt><dd className="inline text-foreground">{data.version ?? 'not set'}</dd></div>
          </dl>
        )}
      </div>
    );
  })();

  return (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={40} />
      <div className="relative mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-8">
        <HoloHeading
          eyebrow="Operations"
          title="System health"
          description={`Facts about what ${productName} depends on. Cloud models are reported as configured or not; their servers are never called.`}
          actions={
            <>
              <span className="font-mono text-xs text-muted-foreground" aria-live="polite">Last checked {lastChecked ?? '--'}</span>
              <HoloButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={() => setNonce((n) => n + 1)} loading={loading}>Refresh</HoloButton>
            </>
          }
        />
        {body}
        <p className="text-xs text-muted-foreground">The server keeps results for 10 seconds, so refreshing sooner shows the same answer.</p>
      </div>
    </div>
  );
}

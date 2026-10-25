'use client';
// Connectors & Plugins marketplace. Status, class and installed flag all come from the server
// (GET /api/connectors). Nothing here invents a "connected" state. Every string from the API is
// rendered as React text, never as HTML.
import * as React from 'react';
import { Plug, Search, Lock, RefreshCw } from 'lucide-react';
import {
  HoloBadge, HoloButton, HoloEmpty, HoloGrid, HoloHeading, HoloModal, HoloOrbBackdrop, HoloPanel, HoloStat, StatusDot, toneClass,
  type HoloTone,
} from '@/components/ui/holo';
import { cn } from '@/lib/utils';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { useJson } from './use-json';
import { CATEGORIES, categoryOf, humanise, type CategoryId } from './catalog-meta';
import { PluginValidator } from './plugin-validator';

type Status = 'available' | 'connected' | 'needs_config' | 'unavailable';
interface ConnectorView {
  id: string;
  name: string;
  version: string;
  publisher: string;
  kind: string;
  capabilities: string[];
  permissionClass: 'A' | 'B' | 'C';
  description: string | null;
  status: Status;
  installed: boolean;
  enabled: boolean;
  /** Not in the payload today; shown when the server starts sending it. */
  scopes?: string[];
}

const STATUS: Record<Status, { label: string; tone: HoloTone; hint: string }> = {
  connected: { label: 'Connected', tone: 'accent', hint: 'The server found live evidence of this connection.' },
  available: { label: 'Available', tone: 'deep', hint: 'Ready to install. Nothing is connected yet.' },
  needs_config: { label: 'Needs setup', tone: 'ember', hint: 'Configuration is missing on the server.' },
  unavailable: { label: 'No adapter yet', tone: 'neutral', hint: 'No adapter exists for this connector yet.' },
};

const CLASS_TEXT: Record<'A' | 'B' | 'C', string> = {
  A: 'Class A: runs on its own',
  B: 'Class B: runs if you delegated it',
  C: 'Class C: always waits for you',
};

function ClassChip({ cls }: { cls: 'A' | 'B' | 'C' }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground" title={CLASS_TEXT[cls]}>
      <Lock className="h-3 w-3" aria-hidden />
      <span>Class {cls}</span>
      <span className="sr-only">{CLASS_TEXT[cls]}</span>
    </span>
  );
}

function LogoTile({ name, tone }: { name: string; tone: HoloTone }) {
  return (
    <span
      aria-hidden
      className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-xl font-semibold', toneClass(tone))}
      style={{ color: 'hsl(var(--holo-c))', background: 'hsl(var(--holo-c) / 0.1)', border: '1px solid hsl(var(--holo-c) / 0.4)', boxShadow: '0 0 18px -6px hsl(var(--holo-c) / 0.7)' }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

function ConnectorCard({ c, onAction }: { c: ConnectorView; onAction: (c: ConnectorView) => void }) {
  const s = STATUS[c.status];
  const scopes = c.scopes ?? [];
  return (
    <HoloPanel as="article" tone={s.tone} interactive className="flex h-full flex-col gap-3" aria-label={`${c.name}, ${s.label}`}>
      <div className="flex items-start gap-3">
        <LogoTile name={c.name} tone={s.tone} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-semibold tracking-tight text-foreground">{c.name}</h3>
          <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">{c.publisher} · v{c.version}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <HoloBadge tone={s.tone} dot pulse={c.status === 'connected'}>{s.label}</HoloBadge>
        <ClassChip cls={c.permissionClass} />
        {c.installed && <HoloBadge tone="neutral">Installed</HoloBadge>}
      </div>
      <p className="text-sm text-muted-foreground">{c.description ?? s.hint}</p>
      {c.capabilities.length > 0 && (
        <p className="font-mono text-[0.6875rem] leading-relaxed text-muted-foreground">
          <span className="uppercase tracking-widest">Can </span>
          {c.capabilities.map(humanise).join(' · ')}
        </p>
      )}
      {scopes.length > 0 && (
        <p className="font-mono text-[0.6875rem] leading-relaxed text-muted-foreground">
          <span className="uppercase tracking-widest">Scopes </span>
          {scopes.join(' · ')}
        </p>
      )}
      <div className="mt-auto pt-2">
        {c.status === 'unavailable' && !c.installed ? (
          <HoloButton variant="ghost" size="sm" tone="neutral" disabled className="w-full">No adapter yet</HoloButton>
        ) : (
          <HoloButton variant={c.installed ? 'ghost' : 'primary'} size="sm" tone={c.installed ? 'neutral' : 'accent'} className="w-full" onClick={() => onAction(c)}>
            {c.installed ? 'Uninstall' : 'Install'}
          </HoloButton>
        )}
      </div>
    </HoloPanel>
  );
}

function SkeletonGrid() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading connectors</span>
      <HoloGrid min="17rem">
        {Array.from({ length: 6 }, (_, i) => (
          <HoloPanel key={i} tone="deep" edge={false} className="h-52 animate-pulse" aria-hidden>
            <div className="h-12 w-12 rounded-xl bg-secondary" />
            <div className="mt-4 h-4 w-2/3 rounded bg-secondary" />
            <div className="mt-3 h-3 w-full rounded bg-secondary" />
            <div className="mt-2 h-3 w-4/5 rounded bg-secondary" />
          </HoloPanel>
        ))}
      </HoloGrid>
    </div>
  );
}

type Pending = { c: ConnectorView; busy: boolean; outcome: null | { kind: 'denied' | 'error' | 'awaiting' | 'ok'; message: string } };

export function ConnectorsScreen() {
  const { productName } = useTenantConfig();
  const [nonce, setNonce] = React.useState(0);
  const { loading, status, data } = useJson<{ connectors?: ConnectorView[] }>('/api/connectors', nonce);
  const [query, setQuery] = React.useState('');
  const [cat, setCat] = React.useState<CategoryId | 'all'>('all');
  const [pending, setPending] = React.useState<Pending | null>(null);

  const list = React.useMemo(() => (Array.isArray(data?.connectors) ? data.connectors : []), [data]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((c) => (cat === 'all' || categoryOf(c.id) === cat) && (!q || `${c.name} ${c.publisher} ${c.capabilities.join(' ')}`.toLowerCase().includes(q)));
  }, [list, query, cat]);
  const counts = React.useMemo(() => ({
    connected: list.filter((c) => c.status === 'connected').length,
    needs: list.filter((c) => c.status === 'needs_config').length,
    installed: list.filter((c) => c.installed).length,
  }), [list]);

  const confirm = async () => {
    if (!pending) return;
    const { c } = pending;
    setPending({ ...pending, busy: true, outcome: null });
    try {
      const res = await fetch(`/api/connectors/${encodeURIComponent(c.id)}/install`, { method: c.installed ? 'DELETE' : 'POST', headers: { Accept: 'application/json' } });
      let body: { error?: string; status?: string } = {};
      try { body = await res.json(); } catch { body = {}; }
      if (res.ok && body.status !== 'AWAITING_APPROVAL' && res.status !== 202) {
        setPending(null);
        setNonce((n) => n + 1);
        return;
      }
      if (res.status === 202 || body.status === 'AWAITING_APPROVAL') setPending({ c, busy: false, outcome: { kind: 'awaiting', message: 'This is waiting for your approval. Approve it from the approval card, then try again.' } });
      else if (res.status === 403) setPending({ c, busy: false, outcome: { kind: 'denied', message: 'The permission engine refused this. Installing is a Class B action and needs a delegation from you. Nothing changed and the refusal is in the ledger.' } });
      else if (res.status === 401) setPending({ c, busy: false, outcome: { kind: 'error', message: 'Your session has ended. Sign in again.' } });
      else setPending({ c, busy: false, outcome: { kind: 'error', message: `The server could not complete this (${res.status}). Nothing changed.` } });
    } catch {
      setPending({ c, busy: false, outcome: { kind: 'error', message: 'The request did not reach the server. Nothing changed.' } });
    }
  };

  const grouped = CATEGORIES.map((g) => ({ ...g, items: filtered.filter((c) => categoryOf(c.id) === g.id) })).filter((g) => g.items.length > 0);

  return (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={60} />
      <div className="relative mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
        <HoloHeading
          eyebrow="Operations"
          title="Connectors & Plugins"
          description={`Everything ${productName} can reach. Status is measured by the server, not declared by the connector, and every outside action still asks permission.`}
          actions={<HoloButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={() => setNonce((n) => n + 1)} loading={loading}>Refresh</HoloButton>}
        />

        {loading ? <SkeletonGrid /> : status === 401 ? (
          <HoloEmpty state="error" title="Sign in to see connectors" description="Your session has ended." action={<HoloButton href="/login" size="sm">Sign in</HoloButton>} />
        ) : status !== 200 || !data ? (
          <HoloEmpty state="error" title="Connectors did not load" description="The server did not return the connector list. Nothing has changed." action={<HoloButton size="sm" onClick={() => setNonce((n) => n + 1)}>Try again</HoloButton>} />
        ) : list.length === 0 ? (
          <HoloEmpty icon={<Plug className="h-6 w-6" aria-hidden />} title="No connectors in the catalog" description="The catalog is empty. You can still check a plugin manifest below." />
        ) : (
          <>
            <HoloGrid min="11rem">
              <HoloStat label="Connected" value={counts.connected} tone="accent" />
              <HoloStat label="Needs setup" value={counts.needs} tone="ember" />
              <HoloStat label="Installed" value={counts.installed} tone="deep" />
              <HoloStat label="In catalog" value={list.length} tone="neutral" />
            </HoloGrid>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block flex-1">
                <span className="sr-only">Search connectors</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, publisher or capability" maxLength={80}
                  className="w-full rounded-lg border border-input bg-background/60 py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
                {[{ id: 'all' as const, label: 'All' }, ...CATEGORIES.filter((g) => list.some((c) => categoryOf(c.id) === g.id))].map((g) => (
                  <button
                    key={g.id} type="button" aria-pressed={cat === g.id} onClick={() => setCat(g.id)}
                    className={cn('rounded-full border px-3 py-1 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', cat === g.id ? 'border-primary text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
                  >{g.label}</button>
                ))}
              </div>
            </div>

            {grouped.length === 0 ? (
              <HoloEmpty icon={<Search className="h-6 w-6" aria-hidden />} title="Nothing matches" description="Try a shorter search or clear the category filter." action={<HoloButton variant="ghost" size="sm" onClick={() => { setQuery(''); setCat('all'); }}>Clear filters</HoloButton>} />
            ) : grouped.map((g) => (
              <section key={g.id} aria-labelledby={`cat-${g.id}`} className="space-y-3">
                <div>
                  <h2 id={`cat-${g.id}`} className="font-display text-xl font-semibold tracking-tight text-foreground">{g.label}</h2>
                  <p className="text-sm text-muted-foreground">{g.blurb}</p>
                </div>
                <HoloGrid min="17rem">
                  {g.items.map((c) => <ConnectorCard key={c.id} c={c} onAction={(x) => setPending({ c: x, busy: false, outcome: null })} />)}
                </HoloGrid>
              </section>
            ))}
          </>
        )}

        <PluginValidator />
      </div>

      <HoloModal
        open={pending !== null}
        onOpenChange={(o) => { if (!o && !pending?.busy) setPending(null); }}
        tone={pending?.outcome?.kind === 'awaiting' ? 'amber' : 'accent'}
        title={pending ? `${pending.c.installed ? 'Uninstall' : 'Install'} ${pending.c.name}?` : 'Confirm'}
        description="This is a Class B action."
        footer={pending && (
          <>
            <HoloButton variant="ghost" size="sm" onClick={() => setPending(null)} disabled={pending.busy}>{pending.outcome ? 'Close' : 'Cancel'}</HoloButton>
            {pending.outcome?.kind !== 'awaiting' && <HoloButton size="sm" loading={pending.busy} onClick={confirm}>{pending.outcome ? 'Try again' : pending.c.installed ? 'Uninstall' : 'Install'}</HoloButton>}
          </>
        )}
      >
        {pending && (
          <div className="space-y-3">
            <p>
              Class B actions run only when you have delegated them. If you have not, {productName} refuses, nothing changes, and the refusal is written to the ledger. Either way the attempt is recorded.
            </p>
            <p className="text-muted-foreground">
              {pending.c.installed
                ? `Uninstalling removes ${productName}’s record of this connector for your account. It does not revoke access on the other service.`
                : 'Installing records that you want this connector available. It does not connect an account, and anything it later does outside still follows its own permission class.'}
            </p>
            <p className="font-mono text-xs text-muted-foreground">Connector class: {CLASS_TEXT[pending.c.permissionClass]}</p>
            {pending.outcome && (
              <div role={pending.outcome.kind === 'awaiting' ? 'status' : 'alert'} className="rounded-lg border border-border p-3">
                <StatusDot tone={pending.outcome.kind === 'awaiting' ? 'amber' : 'ember'} label={pending.outcome.kind === 'awaiting' ? 'Awaiting approval' : pending.outcome.kind === 'denied' ? 'Refused' : 'Error'} showLabel />
                <p className="mt-1 text-sm text-foreground">{pending.outcome.message}</p>
              </div>
            )}
          </div>
        )}
      </HoloModal>
    </div>
  );
}

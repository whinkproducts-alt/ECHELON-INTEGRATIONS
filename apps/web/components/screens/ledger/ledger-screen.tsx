'use client';
// Ledger explorer. Read only: search and filters against GET /api/ledger/search with facet counts from
// /api/ledger/search/facets. Security events (injection blocks, hash lock failures, cross tenant attempts)
// use the denial token together with a "Security event" label. Nothing here can edit a row.
import * as React from 'react';
import { ChevronRight, Lock, RefreshCw, Search, X } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloHeading, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { CopyButton, DateField, FIELD_CLASS, FilterSelect, ProtectedChip, StatusChip, type FilterOption } from './controls';
import { dayEnd, dayStart, fmtTime, isSecurityAction, shortId } from './format';
import type { Facets, FacetValue, LedgerItem } from './types';
import { useJson } from './use-json';
import { usePaged } from './use-paged';

interface Filters { action: string; status: string; category: string; persona: string; initiator: string; correlationId: string; from: string; to: string; q: string }
const NONE: Filters = { action: '', status: '', category: '', persona: '', initiator: '', correlationId: '', from: '', to: '', q: '' };
const DENIAL = 'hsl(var(--denial))';

function buildUrl(f: Filters): string {
  const p = new URLSearchParams();
  for (const k of ['q', 'action', 'status', 'category', 'persona', 'initiator', 'correlationId'] as const) if (f[k]) p.set(k, f[k]);
  const from = dayStart(f.from);
  const to = dayEnd(f.to);
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  p.set('limit', '50');
  return `/api/ledger/search?${p.toString()}`;
}

function opts(list: FacetValue[] | undefined, labels?: Record<string, string>): FilterOption[] {
  return (Array.isArray(list) ? list : [])
    .filter((v): v is { value: string; count: number } => typeof v.value === 'string' && v.value.length > 0)
    .map((v) => ({ value: v.value, label: labels?.[v.value] ?? v.value, count: v.count }));
}

const CATEGORY_LABEL = { money: 'Protected: money', proprietary: 'Protected: proprietary information' };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className="break-words font-mono text-xs text-foreground">{children}</dd>
    </div>
  );
}

function Row({ it, open, onToggle, onCorrelation }: { it: LedgerItem; open: boolean; onToggle: () => void; onCorrelation: (id: string) => void }) {
  const security = isSecurityAction(it.action);
  const panelId = `row-${it.id}`;
  return (
    <>
      <tr
        className="border-b border-border/50 align-top hover:bg-[hsl(var(--whink-accent)/0.05)]"
        style={security ? { boxShadow: `inset 3px 0 0 ${DENIAL}`, background: 'hsl(var(--denial) / 0.08)' } : undefined}
      >
        <td className="px-2 py-1.5">
          <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${it.action}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
          </button>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs text-muted-foreground">{fmtTime(it.createdAt)}</td>
        <td className="px-2 py-1.5">
          <span className="font-mono text-xs text-foreground" style={security ? { color: DENIAL } : undefined}>{it.action}</span>
          {security && <HoloBadge tone="denial" className="ml-2">Security event</HoloBadge>}
        </td>
        <td className="px-2 py-1.5"><StatusChip status={it.status} /></td>
        <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{it.persona ?? '--'}</td>
        <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{it.initiator}</td>
        <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{it.permissionClass}</td>
        <td className="px-2 py-1.5">
          {it.correlationId ? (
            <button type="button" onClick={() => onCorrelation(it.correlationId!)} title={`Filter by correlation id ${it.correlationId}`}
              aria-label={`Filter by correlation id ${it.correlationId}`}
              className="rounded font-mono text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {shortId(it.correlationId)}
            </button>
          ) : <span className="font-mono text-xs text-muted-foreground">--</span>}
        </td>
        <td className="px-2 py-1.5">
          <span className="inline-flex items-center gap-0.5">
            <span className="font-mono text-xs text-muted-foreground" title={it.id}>{shortId(it.id)}</span>
            <CopyButton value={it.id} label={`Copy ledger row id ${it.id}`} />
          </span>
        </td>
      </tr>
      {open && (
        <tr id={panelId} className="border-b border-border/50 bg-[hsl(var(--base)/0.5)]">
          <td />
          <td colSpan={8} className="px-2 py-3">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Row id"><span className="break-all">{it.id}</span></Detail>
              <Detail label="Correlation id">
                <span className="inline-flex items-center gap-1"><span className="break-all">{it.correlationId ?? '--'}</span>{it.correlationId && <CopyButton value={it.correlationId} label="Copy correlation id" />}</span>
              </Detail>
              <Detail label="Tool">{it.tool ?? '--'}</Detail>
              <Detail label="Mind mode">{it.mambaMode ?? '--'}</Detail>
              <Detail label="Confirmed by">{it.confirmationMethod ?? '--'}</Detail>
              <Detail label="Latency">{it.latencyMs === null ? '--' : `${it.latencyMs} ms`}</Detail>
              {it.approvalId && <Detail label="Approval request"><span className="break-all">{it.approvalId}</span></Detail>}
              {it.protected && <Detail label="Protected"><ProtectedChip category={it.category} /></Detail>}
              <div className="sm:col-span-2 lg:col-span-3 grid gap-3 sm:grid-cols-2">
                <Detail label="Input summary (redacted)"><span className="whitespace-pre-wrap">{it.inputSummary ?? '--'}</span></Detail>
                <Detail label="Output summary (redacted)"><span className="whitespace-pre-wrap">{it.outputSummary ?? '--'}</span></Detail>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

export function LedgerScreen({ initialCorrelationId = '' }: { initialCorrelationId?: string }) {
  const [f, setF] = React.useState<Filters>({ ...NONE, correlationId: initialCorrelationId });
  const [qDraft, setQDraft] = React.useState('');
  const [corrDraft, setCorrDraft] = React.useState(initialCorrelationId);
  const [nonce, setNonce] = React.useState(0);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const facets = useJson<Facets>('/api/ledger/search/facets', nonce);
  const list = usePaged<LedgerItem>(buildUrl(f), nonce);
  const filtered = JSON.stringify(f) !== JSON.stringify(NONE);
  const set = (k: keyof Filters) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const fx = facets.status === 200 && facets.data ? facets.data : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setF((cur) => ({ ...cur, q: qDraft.trim(), correlationId: corrDraft.trim() }));
  };
  const byCorrelation = (id: string) => { setCorrDraft(id); setF((cur) => ({ ...cur, correlationId: id })); };
  const clear = () => { setF(NONE); setQDraft(''); setCorrDraft(''); };

  return (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={40} />
      <div className="relative mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-8">
        <HoloHeading
          eyebrow="Governance"
          title="Ledger"
          description="Every action that ran, waited or was denied, with who started it and why."
          actions={<HoloButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={() => setNonce((n) => n + 1)}>Refresh</HoloButton>}
        />

        <p className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          The ledger is append-only and cannot be edited here.
        </p>

        <HoloPanel tone="deep" as="section" aria-label="Search and filters" className="space-y-4">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" role="search">
            <div>
              <label htmlFor="ledger-q" className="mb-1 block font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">Search text</label>
              <input id="ledger-q" value={qDraft} onChange={(e) => setQDraft(e.target.value)} maxLength={200} placeholder="Action or summary contains" className={FIELD_CLASS} />
            </div>
            <div>
              <label htmlFor="ledger-corr" className="mb-1 block font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">Correlation id</label>
              <input id="ledger-corr" value={corrDraft} onChange={(e) => setCorrDraft(e.target.value)} maxLength={100} placeholder="One turn or request" className={`${FIELD_CLASS} font-mono`} />
            </div>
            <HoloButton type="submit" leftIcon={<Search className="h-4 w-4" aria-hidden />}>Search</HoloButton>
          </form>

          <div className="flex flex-wrap items-end gap-3">
            <FilterSelect label="Action" value={f.action} onChange={set('action')} options={opts(fx?.actions)} />
            <FilterSelect label="Status" value={f.status} onChange={set('status')} options={opts(fx?.statuses)} />
            <FilterSelect label="Protected" value={f.category} onChange={set('category')} options={opts(fx?.categories, CATEGORY_LABEL)} allLabel="Any" />
            <FilterSelect label="Mind" value={f.persona} onChange={set('persona')} options={opts(fx?.personas)} />
            <FilterSelect label="Started by" value={f.initiator} onChange={set('initiator')} options={opts(fx?.initiators)} />
            <DateField label="From (UTC)" value={f.from} onChange={set('from')} />
            <DateField label="To (UTC)" value={f.to} onChange={set('to')} />
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {facets.loading ? 'Loading filter counts' : fx ? `Filter counts cover the last ${fx.windowDays} days.` : 'Filter counts did not load. You can still search by text, correlation id and date.'}
          </p>

          {filtered && (
            <div className="flex flex-wrap items-center gap-2">
              {f.correlationId && (
                <HoloBadge tone="accent">
                  Correlation id <span className="ml-1 font-mono">{shortId(f.correlationId)}</span>
                  <button type="button" aria-label="Remove correlation id filter" onClick={() => { setCorrDraft(''); set('correlationId')(''); }} className="ml-1 rounded focus-visible:outline-2 focus-visible:outline-ring"><X className="h-3 w-3" aria-hidden /></button>
                </HoloBadge>
              )}
              <HoloButton variant="ghost" size="sm" onClick={clear}>Clear all filters</HoloButton>
            </div>
          )}
        </HoloPanel>

        <div aria-live="polite">
          {list.loading ? (
            <HoloEmpty state="loading" title="Loading ledger" />
          ) : list.status !== 200 ? (
            <HoloEmpty state="error" title={list.status === 401 ? 'Sign in to see the ledger' : 'The ledger did not load'}
              description="Nothing was changed. The ledger itself is not affected."
              action={list.status === 401 ? <HoloButton size="sm" href="/login">Sign in</HoloButton> : <HoloButton size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>Try again</HoloButton>} />
          ) : list.items.length === 0 ? (
            <HoloEmpty title={filtered ? 'No ledger rows match' : 'The ledger is empty'}
              description={filtered ? 'Try fewer filters or a wider date range.' : 'Rows appear here as soon as an action runs, waits for approval or is denied.'}
              action={filtered ? <HoloButton size="sm" variant="ghost" onClick={clear}>Clear all filters</HoloButton> : undefined} />
          ) : (
            <HoloPanel tone="deep" padded={false} className="overflow-hidden">
              <div className="overflow-x-auto" role="region" aria-label="Ledger entries, scroll horizontally for more columns" tabIndex={0}>
                <table className="w-full min-w-[56rem] border-collapse text-left">
                  <caption className="sr-only">Ledger rows, newest first</caption>
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th scope="col" className="w-8 px-2 py-2"><span className="sr-only">Expand</span></th>
                      <th scope="col" className="px-2 py-2 font-medium">Time</th>
                      <th scope="col" className="px-2 py-2 font-medium">Action</th>
                      <th scope="col" className="px-2 py-2 font-medium">Status</th>
                      <th scope="col" className="px-2 py-2 font-medium">Mind</th>
                      <th scope="col" className="px-2 py-2 font-medium">Started by</th>
                      <th scope="col" className="px-2 py-2 font-medium">Class</th>
                      <th scope="col" className="px-2 py-2 font-medium">Correlation</th>
                      <th scope="col" className="px-2 py-2 font-medium">Row id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.items.map((it) => (
                      <Row key={it.id} it={it} open={openId === it.id} onToggle={() => setOpenId((cur) => (cur === it.id ? null : it.id))} onCorrelation={byCorrelation} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3">
                <HoloBadge tone="neutral">{list.items.length} rows{list.hasMore ? ', more available' : ', end of results'}</HoloBadge>
                {list.moreError && <span role="alert" className="text-xs text-muted-foreground"><span className="font-mono uppercase">Error: </span>The next page did not load.</span>}
                {list.hasMore && <HoloButton size="sm" variant="ghost" onClick={list.loadMore} loading={list.loadingMore}>Load more</HoloButton>}
              </div>
            </HoloPanel>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';
// Approval history: filters, table, status chips, cursor pagination. Read only.
import * as React from 'react';
import { History, Search } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloPanel } from '@/components/ui/holo';
import { DateField, FilterSelect, ProtectedChip, StatusChip } from '@/components/screens/ledger/controls';
import { dayEnd, dayStart, fmtTime } from '@/components/screens/ledger/format';
import { usePaged } from '@/components/screens/ledger/use-paged';
import { CATEGORY_OPTIONS, KIND_LABEL, KIND_OPTIONS, STATUS_OPTIONS, type HistoryItem } from './types';

interface Filters { status: string; category: string; kind: string; from: string; to: string }
const NONE: Filters = { status: '', category: '', kind: '', from: '', to: '' };

function buildUrl(f: Filters): string {
  const p = new URLSearchParams();
  if (f.status) p.set('status', f.status);
  if (f.category) p.set('category', f.category);
  if (f.kind) p.set('kind', f.kind);
  const from = dayStart(f.from);
  const to = dayEnd(f.to);
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  p.set('limit', '25');
  return `/api/approvals/history?${p.toString()}`;
}

export function HistoryTable({ nonce, onOpen }: { nonce: number; onOpen: (id: string) => void }) {
  const [f, setF] = React.useState<Filters>(NONE);
  const url = buildUrl(f);
  const [retry, setRetry] = React.useState(0);
  const list = usePaged<HistoryItem>(url, nonce * 1000 + retry);
  const filtered = JSON.stringify(f) !== JSON.stringify(NONE);
  const set = (k: keyof Filters) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));

  return (
    <div className="space-y-4">
      <HoloPanel tone="deep" as="section" aria-label="History filters">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect label="Status" value={f.status} onChange={set('status')} options={STATUS_OPTIONS} />
          <FilterSelect label="Protected" value={f.category} onChange={set('category')} options={CATEGORY_OPTIONS} allLabel="Any" />
          <FilterSelect label="Type" value={f.kind} onChange={set('kind')} options={KIND_OPTIONS} />
          <DateField label="From (UTC)" value={f.from} onChange={set('from')} />
          <DateField label="To (UTC)" value={f.to} onChange={set('to')} />
          {filtered && <HoloButton variant="ghost" size="sm" onClick={() => setF(NONE)}>Clear filters</HoloButton>}
        </div>
      </HoloPanel>

      <div aria-live="polite">
        {list.loading ? (
          <HoloEmpty state="loading" title="Loading history" />
        ) : list.status !== 200 ? (
          <HoloEmpty state="error" title={list.status === 401 ? 'Sign in to see approvals' : 'History did not load'}
            description="Nothing was changed. Your pending approvals above are not affected."
            action={list.status === 401 ? <HoloButton size="sm" href="/login">Sign in</HoloButton> : <HoloButton size="sm" variant="ghost" onClick={() => setRetry((n) => n + 1)}>Try again</HoloButton>} />
        ) : list.items.length === 0 ? (
          <HoloEmpty icon={<History className="h-6 w-6" aria-hidden />}
            title={filtered ? 'No requests match these filters' : 'No approval history yet'}
            description={filtered ? 'Try widening the date range or clearing a filter.' : 'Every request that needs your yes will be listed here, whatever you decided.'}
            action={filtered ? <HoloButton size="sm" variant="ghost" leftIcon={<Search className="h-4 w-4" aria-hidden />} onClick={() => setF(NONE)}>Clear filters</HoloButton> : undefined} />
        ) : (
          <HoloPanel tone="deep" padded={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <caption className="sr-only">Approval requests, newest first</caption>
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th scope="col" className="px-3 py-2 font-medium">What</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 font-medium">Type</th>
                    <th scope="col" className="px-3 py-2 font-medium">Asked</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((it) => (
                    <tr key={it.id} className="border-b border-border/50 align-top last:border-0 hover:bg-[hsl(var(--whink-accent)/0.05)]">
                      <td className="max-w-[22rem] px-3 py-2">
                        <button type="button" onClick={() => onOpen(it.id)} aria-label={`Open details: ${it.tool ?? it.kind}`}
                          className="block w-full rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          <span className="font-mono text-xs text-foreground">{it.tool ?? KIND_LABEL[it.kind] ?? it.kind}</span>
                          <span className="mt-0.5 line-clamp-2 block break-words text-xs text-muted-foreground">{it.summary ?? '(no description)'}</span>
                        </button>
                        {it.protected && <div className="mt-1"><ProtectedChip category={it.category} /></div>}
                      </td>
                      <td className="px-3 py-2"><StatusChip status={it.status} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{KIND_LABEL[it.kind] ?? it.kind}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{fmtTime(it.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3">
              <HoloBadge tone="neutral">{list.items.length} shown{list.hasMore ? ', more available' : ', end of history'}</HoloBadge>
              {list.moreError && <span role="alert" className="text-xs text-muted-foreground"><span className="font-mono uppercase">Error: </span>The next page did not load.</span>}
              {list.hasMore && <HoloButton size="sm" variant="ghost" onClick={list.loadMore} loading={list.loadingMore}>Load more</HoloButton>}
            </div>
          </HoloPanel>
        )}
      </div>
    </div>
  );
}

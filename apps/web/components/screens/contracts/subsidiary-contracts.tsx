'use client';
// Contracts section for the subsidiary page. Props: { subsidiaryId: string }. GET /api/contracts?subsidiary=<id>.
import * as React from 'react';
import Link from 'next/link';
import { HoloBadge, HoloButton, HoloEmpty } from '@/components/ui/holo';
import { fmtDate } from '@/components/screens/subsidiaries/format';
import { useJson } from '@/components/screens/subsidiaries/use-json';
import { renewalText } from './contract-row';
import { useNow } from './use-now';
import { fmtMoney, statusLabel, statusTone, type ContractListResponse } from './types';

export function SubsidiaryContracts({ subsidiaryId }: { subsidiaryId: string }) {
  const now = useNow();
  const { result, retry } = useJson<ContractListResponse>(`/api/contracts?subsidiary=${encodeURIComponent(subsidiaryId)}&limit=25`);
  if (result.state === 'loading') {
    return <div role="status" aria-busy="true" aria-live="polite"><span className="sr-only">Loading contracts</span><div className="h-24 animate-pulse rounded-xl bg-secondary/50 motion-reduce:animate-none" aria-hidden /></div>;
  }
  if (result.state !== 'ok') {
    return <HoloEmpty state="error" title="Contracts could not be loaded" description="The server did not answer." action={<HoloButton onClick={retry}>Retry</HoloButton>} />;
  }
  const items = result.data.contracts;
  if (items.length === 0) {
    return <HoloEmpty title="No contracts recorded for this subsidiary" description="Recording a contract does not move money or send anything." action={<HoloButton href="/dashboard/contracts/new" variant="ghost">Record a contract</HoloButton>} />;
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border/60 rounded-xl border border-border bg-background/40">
        {items.map((c) => {
          const renewal = renewalText(c, now);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/dashboard/contracts/${encodeURIComponent(c.id)}`} className="break-words text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{c.title}</Link>
                <p className="break-words text-xs text-muted-foreground">{c.counterparty}{c.endDate ? ` · ends ${fmtDate(c.endDate)}` : ''}{renewal ? ` · ${renewal}` : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs tabular-nums text-foreground">{fmtMoney(c.valueAmount, c.currency)}</span>
                <HoloBadge tone={statusTone(c.status)} dot>{statusLabel(c.status)}</HoloBadge>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        {result.data.nextCursor && <span className="text-xs text-muted-foreground">Showing the latest 25.</span>}
        <Link href="/dashboard/contracts" className="text-xs text-primary underline-offset-4 hover:underline">All contracts</Link>
      </div>
    </div>
  );
}

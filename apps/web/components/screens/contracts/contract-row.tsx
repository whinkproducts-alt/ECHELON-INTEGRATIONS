'use client';
import * as React from 'react';
import Link from 'next/link';
import { CalendarClock, ExternalLink } from 'lucide-react';
import { HoloBadge, HoloPanel } from '@/components/ui/holo';
import { SubsidiaryChip, projectReportHref } from '@/components/subsidiaries';
import { fmtDate } from '@/components/screens/subsidiaries/format';
import { daysUntil, fmtMoney, inDays, statusLabel, statusTone, type Contract } from './types';

export function renewalText(c: Pick<Contract, 'renewalDate' | 'status'>, now: number | null): string | null {
  if (now === null || !c.renewalDate) return null;
  const n = daysUntil(c.renewalDate, now);
  if (n === null) return null;
  if (c.status === 'COMPLETED' || c.status === 'TERMINATED') return `Renewal date ${fmtDate(c.renewalDate)}`;
  return n >= 0 ? `Renews ${inDays(n)}` : `Renewal date passed ${inDays(n)}`;
}

export function ContractRow({ c, now, showSubsidiary = true }: { c: Contract; now: number | null; showSubsidiary?: boolean }) {
  const renewal = renewalText(c, now);
  return (
    <HoloPanel as="article" aria-label={c.title} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-foreground">
            <Link href={`/dashboard/contracts/${encodeURIComponent(c.id)}`} className="break-words underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{c.title}</Link>
          </h3>
          <p className="break-words text-sm text-muted-foreground">{c.counterparty}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HoloBadge tone={statusTone(c.status)} dot>{statusLabel(c.status)}</HoloBadge>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {showSubsidiary && <SubsidiaryChip id={c.subsidiary} />}
        <span className="font-mono tabular-nums text-foreground">{fmtMoney(c.valueAmount, c.currency)}</span>
        {c.projectId && (
          <Link href={projectReportHref(c.projectId, c.subsidiary)} className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
            <ExternalLink className="h-3 w-3" aria-hidden />Project report
          </Link>
        )}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <div className="flex gap-1.5"><dt>Start</dt><dd className="font-mono text-foreground">{fmtDate(c.startDate)}</dd></div>
        <div className="flex gap-1.5"><dt>End</dt><dd className="font-mono text-foreground">{fmtDate(c.endDate)}</dd></div>
        <div className="flex gap-1.5"><dt>Renewal</dt><dd className="font-mono text-foreground">{fmtDate(c.renewalDate)}</dd></div>
      </dl>
      {renewal && <p className="flex items-center gap-1.5 text-xs text-foreground"><CalendarClock className="h-3.5 w-3.5 text-primary" aria-hidden />{renewal}</p>}
    </HoloPanel>
  );
}

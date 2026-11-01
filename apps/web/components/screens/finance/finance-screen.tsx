'use client';
// Finance. READ-ONLY. All figures come from GET /api/finance/summary. Currencies are never mixed: one section per
// currency. Amber is used only for the budget limit meter. Nothing on this screen moves money.
import * as React from 'react';
import Link from 'next/link';
import { CalendarClock, EyeOff, Landmark, ShieldCheck } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloHeading, HoloMeter, HoloOrbBackdrop, HoloPanel, HoloStat, type HoloTone } from '@/components/ui/holo';
import { findSubsidiary } from '@/components/subsidiaries';
import { fmtDate } from '@/components/screens/subsidiaries/format';
import { useJson } from '@/components/screens/subsidiaries/use-json';
import { fmtCompact, fmtInt, fmtUsd } from '@/components/screens/usage/format';
import { useNow } from '@/components/screens/contracts/use-now';
import { daysUntil, fmtMoney, inDays, statusLabel, statusTone } from '@/components/screens/contracts/types';
import { BarChart, type BarItem } from './bar-chart';
import type { CurrencyTotal, FinanceSummary, ModelSpend } from './types';

function subName(id: string | null): string {
  return id ? (findSubsidiary(id)?.name ?? id) : 'Unassigned';
}

function CurrencySection({ cur, s }: { cur: CurrencyTotal; s: FinanceSummary }) {
  const rows = s.contracts.byGroup.filter((r) => r.currency === cur.currency);
  const bySub = new Map<string, number>();
  const byStatus = new Map<string, number>();
  let counted = 0;
  for (const r of rows) {
    const v = Number(r.total);
    bySub.set(r.subsidiary ?? '', (bySub.get(r.subsidiary ?? '') ?? 0) + v);
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + v);
    counted += r.contractsWithValue;
  }
  const subItems: BarItem[] = [...bySub.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
    key: k || 'unassigned', label: subName(k || null), value: v, valueText: fmtMoney(v.toFixed(2), cur.currency),
  }));
  const statusItems: BarItem[] = [...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
    key: k, label: statusLabel(k), value: v, valueText: fmtMoney(v.toFixed(2), cur.currency), tone: statusTone(k) as HoloTone,
  }));
  const missing = cur.contracts - counted;
  const headingId = `cur-${cur.currency}`;
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="font-display text-2xl font-semibold text-foreground">Contract value in {cur.currency}</h2>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="space-y-2">
          <HoloStat label={`Total ${cur.currency}`} value={Number(cur.total)} format={(n) => fmtMoney(n.toFixed(2), cur.currency)} />
          <p className="font-mono text-xs text-muted-foreground">{fmtInt(cur.contracts)} {cur.contracts === 1 ? 'contract' : 'contracts'}</p>
          {missing > 0 && <p className="text-xs text-muted-foreground" role="note">{missing} of {cur.contracts} have no value set, so they add nothing to this total.</p>}
        </div>
        <HoloPanel className="grid gap-8 md:grid-cols-2">
          <BarChart title="By subsidiary" caption={`Sum of contract values in ${cur.currency}`} items={subItems} />
          <BarChart title="By status" caption={`Sum of contract values in ${cur.currency}`} items={statusItems} />
        </HoloPanel>
      </div>
    </section>
  );
}

function Upcoming({ s, now }: { s: FinanceSummary; now: number | null }) {
  const items = s.upcoming.items;
  return (
    <section aria-labelledby="up-title" className="space-y-3">
      <h2 id="up-title" className="font-display text-2xl font-semibold text-foreground">Next {s.upcoming.windowDays} days</h2>
      {items.length === 0 ? (
        <HoloEmpty title="No renewals or end dates coming up" description={`No draft or active contract ends or renews in the next ${s.upcoming.windowDays} days.`} />
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border bg-background/40">
          {items.map((i) => {
            const n = now === null ? null : daysUntil(i.date, now);
            return (
              <li key={`${i.kind}-${i.contractId}-${i.date}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/dashboard/contracts/${encodeURIComponent(i.contractId)}`} className="break-words text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{i.title}</Link>
                  <p className="break-words text-xs text-muted-foreground">{i.counterparty} · {subName(i.subsidiary)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <HoloBadge tone={i.kind === 'end' ? 'ember' : 'accent'}>{i.kind === 'end' ? 'Ends' : 'Renews'}</HoloBadge>
                  <span className="inline-flex items-center gap-1.5 font-mono text-foreground"><CalendarClock className="h-3.5 w-3.5 text-primary" aria-hidden />{fmtDate(i.date)}{n !== null && <span className="text-muted-foreground">({inDays(n)})</span>}</span>
                  <span className="font-mono tabular-nums text-foreground">{fmtMoney(i.valueAmount, i.currency)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Spend({ m }: { m: ModelSpend }) {
  const used = m.tokensIn + m.tokensOut;
  const budget = m.monthlyTokenBudget;
  const resets = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(m.resetsAt));
  return (
    <section aria-labelledby="spend-title" className="space-y-3">
      <h2 id="spend-title" className="font-display text-2xl font-semibold text-foreground">Model and token spend, {m.month}</h2>
      <HoloPanel className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">Calls</dt><dd className="font-mono text-xl tabular-nums text-foreground">{fmtInt(m.calls)}</dd></div>
          <div><dt className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">Tokens in / out</dt><dd className="font-mono text-xl tabular-nums text-foreground">{fmtCompact(m.tokensIn)} / {fmtCompact(m.tokensOut)}</dd></div>
          <div><dt className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">Recorded cost</dt><dd className="font-mono text-xl tabular-nums text-foreground">{fmtUsd(m.costMicros)}</dd></div>
        </dl>
        {m.costMicros === 0 && m.calls > 0 && <p className="text-xs text-muted-foreground">Cost shows 0 when no model prices are configured on the server. It is not an estimate.</p>}
        {budget ? (
          <div className="space-y-2">
            <HoloMeter label="Tokens used against the monthly budget" value={used} max={budget} limit={m.budgetState !== 'ok'}
              valueText={`${fmtCompact(used)} of ${fmtCompact(budget)}`} />
            {m.budgetState !== 'ok' && <p className="text-xs text-foreground" role="status">{m.budgetState === 'hard' ? 'Budget limit reached.' : 'Approaching the budget limit.'}</p>}
            <p className="text-xs text-muted-foreground">Resets {resets} (UTC). Change the limit on the <Link href="/dashboard/usage" className="text-primary underline-offset-4 hover:underline">Usage screen</Link>.</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No monthly token budget is set, so there is no limit to measure against. {fmtCompact(used)} tokens used this month.</p>
        )}
      </HoloPanel>
    </section>
  );
}

function Omitted({ items }: { items: FinanceSummary['omitted'] }) {
  return (
    <HoloPanel as="section" aria-labelledby="omit-title" tone="neutral" className="space-y-3">
      <h2 id="omit-title" className="flex items-center gap-2 font-display text-xl font-semibold text-foreground"><EyeOff className="h-5 w-5 text-muted-foreground" aria-hidden />Not shown on this screen</h2>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">The server reports nothing omitted.</p> : (
        <>
          <p className="text-sm text-muted-foreground">These figures could not be computed honestly, so they are left out rather than guessed.</p>
          <ul className="space-y-2">
            {items.map((o) => (
              <li key={o.field} className="text-sm text-foreground"><span className="mr-2 font-mono text-xs text-muted-foreground">{o.field}</span>{o.reason}</li>
            ))}
          </ul>
        </>
      )}
    </HoloPanel>
  );
}

export function FinanceScreen() {
  const now = useNow();
  const { result, retry } = useJson<FinanceSummary>('/api/finance/summary');
  let body: React.ReactNode;
  if (result.state === 'loading') {
    body = (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading finance summary</span>
        <div className="grid gap-4" aria-hidden>{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-secondary/50 motion-reduce:animate-none" />)}</div>
      </div>
    );
  } else if (result.state !== 'ok') {
    body = <HoloEmpty state="error" title="Finance summary could not be loaded" description="The server did not answer. Nothing was changed." action={<HoloButton onClick={retry}>Retry</HoloButton>} />;
  } else {
    const s = result.data;
    const asOf = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s.asOf));
    body = (
      <div className="space-y-10">
        <p className="font-mono text-xs text-muted-foreground">As of {asOf}</p>
        {s.contracts.total === 0 ? (
          <HoloEmpty icon={<Landmark className="h-6 w-6" aria-hidden />} title="No contracts recorded yet" description="Contract value appears here once you record contracts." action={<HoloButton href="/dashboard/contracts/new" variant="ghost">Record a contract</HoloButton>} />
        ) : s.contracts.byCurrency.map((c) => <CurrencySection key={c.currency} cur={c} s={s} />)}
        <Upcoming s={s} now={now} />
        <Spend m={s.modelSpend} />
        <Omitted items={s.omitted} />
      </div>
    );
  }
  return (
    <div className="relative isolate min-h-full overflow-hidden">
      <HoloOrbBackdrop stars={40} floor={false} />
      <div className="relative z-10 mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-8">
        <HoloHeading eyebrow="Read-only" title="Finance" description="Contract value, upcoming dates and model spend, straight from your records." />
        <HoloPanel tone="accent" padded className="!p-3" role="note">
          <p className="flex items-start gap-2 text-sm text-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span>This screen only reports. Any payment or transfer needs your approval.</span></p>
        </HoloPanel>
        {body}
      </div>
    </div>
  );
}

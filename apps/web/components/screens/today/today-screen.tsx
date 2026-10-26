'use client';
// Today: the chief-of-staff briefing. Every figure comes from a real endpoint; if one is unavailable the card says so.
// Greeting and date are computed on the client after mount, so server HTML is deterministic.
import * as React from 'react';
import { CalendarX, ExternalLink, Newspaper, Sparkles, ShieldAlert } from 'lucide-react';
import { HoloBadge, HoloEmpty, HoloHeading, HoloMeter, HoloPanel, HoloStat } from '@/components/ui/holo';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { ledgerToSecurityEvents } from '@/components/neural-link/security-events';
import { asArray, asRecord, fmtInt, useApi } from '../anatomy/use-api';
import { PendingApprovals } from './pending-approvals';
import { RecommendationsColumn } from './recommendations-column';

function greetingFor(hour: number): string {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.28em] text-muted-foreground">{icon}{title}</h2>
      {children}
    </section>
  );
}

export function TodayScreen() {
  const { productName } = useTenantConfig();
  const settings = useApi('/api/settings');
  const news = useApi('/api/news?category=all');
  const usage = useApi('/api/usage?range=7d');
  const security = useApi('/api/security/status');
  const ledger = useApi('/api/ledger?limit=200');
  const connectors = useApi('/api/connectors');
  const [when, setWhen] = React.useState<{ greeting: string; date: string } | null>(null);
  const [pendingCount, setPendingCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => {
      const now = new Date();
      setWhen({ greeting: greetingFor(now.getHours()), date: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const name = settings.state === 'ok' ? (() => { const p = asRecord(asRecord(settings.data).profile).displayName; return typeof p === 'string' && p ? p : null; })() : null;
  const budget = usage.state === 'ok' ? asRecord(asRecord(usage.data).budget) : null;
  const limit = budget && typeof budget.limit === 'number' ? budget.limit : null;
  const used = budget ? Number(budget.used ?? 0) : 0;
  const bState = budget && typeof budget.state === 'string' ? budget.state : null;
  const secTotal = security.state === 'ok' ? asRecord(asRecord(asRecord(security.data).securityEvents).last24h).total : undefined;
  const fromStatus = typeof secTotal === 'number';
  const secCount = fromStatus ? secTotal : ledger.state === 'ok' ? ledgerToSecurityEvents(ledger.data).length : null;
  const headlines = news.state === 'ok' ? asArray(asRecord(news.data).items).map(asRecord).filter((i) => typeof i.title === 'string').slice(0, 5) : null;
  const calConnected = connectors.state === 'ok' && asArray(asRecord(connectors.data).connectors).map(asRecord).some((c) => c.id === 'google_calendar' && c.status === 'connected');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
      <HoloHeading
        eyebrow={when?.date ?? 'Briefing'}
        title={when ? `${when.greeting}${name ? `, ${name}` : ''}` : 'Today'}
        description="What needs you, what is coming, and what the world is saying. Nothing here is guessed."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {pendingCount === null
          ? <HoloPanel tone="neutral"><p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Approvals pending</p><p className="mt-2 font-mono text-lg text-muted-foreground">not reported</p></HoloPanel>
          : <HoloStat label="Approvals pending" value={pendingCount} tone={pendingCount > 0 ? 'amber' : 'accent'} suffix={pendingCount > 0 ? ' awaiting' : ''} />}
        {secCount === null
          ? <HoloPanel tone="neutral"><p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Security events</p><p className="mt-2 font-mono text-lg text-muted-foreground">{ledger.state === 'loading' || security.state === 'loading' ? 'loading' : 'not reported'}</p></HoloPanel>
          : (
            <HoloPanel tone={secCount > 0 ? 'denial' : 'accent'}>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Security events</p>
              <p className="mt-2 flex items-center gap-3 font-mono text-3xl tabular-nums text-foreground">{secCount}
                {secCount > 0 && <HoloBadge tone="denial" dot>Review in security</HoloBadge>}</p>
              <p className="mt-1 text-xs text-muted-foreground">{fromStatus ? 'In the last 24 hours' : 'In the latest 200 ledger entries'}</p>
            </HoloPanel>
          )}
        <HoloPanel tone={bState === 'soft' || bState === 'hard' ? 'amber' : 'accent'}>
          {budget && bState ? (
            limit === null
              ? <><p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Monthly token budget</p><p className="mt-2 font-mono text-lg text-foreground">Unlimited</p><p className="text-xs text-muted-foreground">{fmtInt(used)} tokens used this month</p></>
              : <HoloMeter label="Monthly token budget" value={used} max={limit} limit={bState !== 'ok'} valueText={`${bState === 'hard' ? 'Limit reached. ' : bState === 'soft' ? 'Near limit. ' : ''}${fmtInt(used)} of ${fmtInt(limit)}`} />
          ) : (
            <><p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Monthly token budget</p><p className="mt-2 font-mono text-lg text-muted-foreground">{usage.state === 'loading' ? 'loading' : 'not reported'}</p></>
          )}
        </HoloPanel>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <Section title="Needs your approval" icon={<ShieldAlert className="h-3.5 w-3.5" aria-hidden />}>
            <PendingApprovals onCount={setPendingCount} />
          </Section>

          <Section title="Calendar" icon={<CalendarX className="h-3.5 w-3.5" aria-hidden />}>
            <HoloEmpty
              icon={<CalendarX className="h-6 w-6" aria-hidden />}
              title={calConnected ? 'Calendar events are not shown yet' : 'Calendar not connected'}
              description={calConnected
                ? 'A calendar is connected, but this screen has no events feed to read from yet. Your day will appear here once it does.'
                : 'Connect a calendar in Connectors and today’s events will appear here.'}
            />
          </Section>

          <Section title="Headlines" icon={<Newspaper className="h-3.5 w-3.5" aria-hidden />}>
            {news.state === 'loading' && <HoloEmpty state="loading" title="Fetching headlines" />}
            {news.state === 'unavailable' && <HoloEmpty state="error" title="Headlines did not load" description="The news feed is unreachable right now." />}
            {headlines && headlines.length === 0 && <HoloEmpty title="No headlines" description="The feeds returned nothing." />}
            {headlines && headlines.length > 0 && (
              <ol className="space-y-2">
                {headlines.map((h, i) => {
                  const href = safeUrl(h.link);
                  const title = String(h.title);
                  return (
                    <li key={`${i}-${title}`} className="list-none">
                      <HoloPanel className="!p-4">
                        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">{typeof h.source === 'string' ? h.source : 'Source unknown'}</p>
                        {href
                          ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-start gap-2 font-display text-base text-foreground hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{title}<ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden /><span className="sr-only">(opens in a new tab)</span></a>
                          : <p className="mt-1 font-display text-base text-foreground">{title}</p>}
                      </HoloPanel>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        </div>

        <Section title={`${productName} recommends`} icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}>
          <RecommendationsColumn />
        </Section>
      </div>
    </div>
  );
}

export default TodayScreen;

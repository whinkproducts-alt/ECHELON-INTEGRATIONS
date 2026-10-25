'use client';
// Security Center. Posture is computed only from fields GET /api/security/status returned.
// A fact that is missing is shown as "Not reported", never as a pass. Denial red marks security
// events only. Ledger text can echo untrusted content, so it is rendered as capped plain text.
import * as React from 'react';
import { ShieldAlert, ShieldX, Ban, Fingerprint, RefreshCw, GitBranch, Code2, CircleHelp } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloGrid, HoloHeading, HoloMeter, HoloOrbBackdrop, HoloPanel, HoloStat, StatusDot, toneClass, type HoloTone } from '@/components/ui/holo';
import { ledgerToSecurityEvents } from '@/components/neural-link/security-events';
import type { SecurityEvent, SecurityEventKind } from '@/components/neural-link/security-event-display';
import { useJson } from './use-json';
import { computeFacts, computePosture, type Fact, type FactState, type SecurityStatus } from './posture';
import { ENFORCED_IN_CODE, GITHUB_ACTIONS } from './checklist-data';

const FACT_META: Record<FactState, { label: string; tone: HoloTone }> = {
  ok: { label: 'Reported OK', tone: 'accent' },
  attention: { label: 'Needs attention', tone: 'ember' },
  waiting: { label: 'Awaiting approval', tone: 'amber' },
  not_reported: { label: 'Not reported', tone: 'neutral' },
};

const KIND_META: Record<SecurityEventKind, { label: string; icon: typeof ShieldAlert }> = {
  injection_blocked: { label: 'Injection blocked', icon: ShieldX },
  action_blocked: { label: 'Action blocked', icon: Ban },
  approval_hash_mismatch: { label: 'Approval hash mismatch', icon: Fingerprint },
  cross_tenant_attempt: { label: 'Cross account attempt', icon: ShieldAlert },
};

const MAX_DETAIL = 200;
const stamp = (ts: number) => new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

function FactRow({ f }: { f: Fact }) {
  const m = FACT_META[f.state];
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{f.label}</p>
        <p className="font-mono text-xs text-muted-foreground">{f.detail}</p>
      </div>
      <HoloBadge tone={m.tone} dot pulse={f.state === 'waiting'}>{m.label}</HoloBadge>
    </li>
  );
}

function Hero({ status, onRetry }: { status: SecurityStatus; onRetry: () => void }) {
  const facts = React.useMemo(() => computeFacts(status), [status]);
  const p = computePosture(facts);
  const ev24 = status.securityEvents?.last24h;
  const ev7 = status.securityEvents?.last7d;
  const evTone = (n?: number): HoloTone => (typeof n === 'number' && n > 0 ? 'denial' : 'neutral');
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <HoloPanel tone={p.tone} glow="soft" brackets className="flex flex-col items-center gap-3 text-center">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.25em] text-muted-foreground">Threat posture</p>
          <HoloMeter variant="arc" size={200} value={p.passing} max={Math.max(1, p.total)} tone={p.tone} label="checks reported OK" valueText={`${p.passing}/${p.total}`} />
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">{p.headline}</h2>
          <p className="text-sm text-muted-foreground">
            {p.attention > 0 ? `${p.attention} need attention. ` : ''}{p.notReported > 0 ? `${p.notReported} not reported, which is not the same as passing.` : 'Every check reported.'}
          </p>
          <p className="font-mono text-[0.6875rem] text-muted-foreground">
            {status.generatedAt ? `Computed ${new Date(status.generatedAt).toISOString().slice(0, 19).replace('T', ' ')} UTC` : 'Computation time not reported'}
          </p>
          <HoloButton variant="ghost" size="sm" onClick={onRetry} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>Recheck</HoloButton>
        </HoloPanel>
        <HoloPanel tone="deep">
          <h2 className="mb-1 font-display text-lg font-semibold text-foreground">What the server measured</h2>
          <ul>{facts.map((f) => <FactRow key={f.id} f={f} />)}</ul>
        </HoloPanel>
      </div>

      <HoloGrid min="12rem">
        <HoloStat label="Events, 24 hours" value={ev24?.total ?? 0} tone={evTone(ev24?.total)} delta={ev24 ? undefined : 'not reported'} />
        <HoloStat label="Events, 7 days" value={ev7?.total ?? 0} tone={evTone(ev7?.total)} delta={ev7 ? undefined : 'not reported'} />
        <HoloStat label="Injections blocked, 7d" value={ev7?.injectionBlocks ?? 0} tone={evTone(ev7?.injectionBlocks)} />
        <HoloStat label="Hash lock failures, 7d" value={ev7?.hashLockFailures ?? 0} tone={evTone(ev7?.hashLockFailures)} />
      </HoloGrid>
    </div>
  );
}

function Timeline() {
  const [nonce, setNonce] = React.useState(0);
  const { loading, status, data } = useJson<unknown>('/api/ledger?limit=200', nonce);
  const events: SecurityEvent[] = React.useMemo(() => ledgerToSecurityEvents(data).sort((a, b) => b.ts - a.ts).slice(0, 50), [data]);
  return (
    <section aria-label="Security event timeline" className="space-y-3">
      <HoloHeading level={2} tone="denial" eyebrow="Ledger" title="Security event timeline" description="Blocked injections, refused actions, hash lock failures and cross account attempts from your latest 200 ledger rows. Newest first." />
      {loading ? (
        <HoloEmpty state="loading" title="Reading the ledger" />
      ) : status !== 200 ? (
        <HoloEmpty state="error" title="The ledger did not load" description="No events can be shown. This does not mean there were none." action={<HoloButton size="sm" onClick={() => setNonce((n) => n + 1)}>Try again</HoloButton>} />
      ) : events.length === 0 ? (
        <HoloEmpty icon={<ShieldAlert className="h-6 w-6" aria-hidden />} title="No security events in recent activity" description="Nothing blocked or refused in the latest 200 ledger rows." />
      ) : (
        <HoloPanel tone="denial" padded={false}>
          <ol className="relative divide-y divide-border">
            {events.map((e) => {
              const m = KIND_META[e.kind];
              const Icon = m.icon;
              return (
                <li key={e.id} className="flex gap-3 p-4">
                  <span aria-hidden className={`${toneClass('denial')} mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full`} style={{ color: 'hsl(var(--holo-c))', background: 'hsl(var(--holo-c) / 0.12)', border: '1px solid hsl(var(--holo-c) / 0.45)' }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-sm font-semibold text-foreground">{m.label}</span>
                      <time dateTime={new Date(e.ts).toISOString()} className="font-mono text-xs text-muted-foreground">{stamp(e.ts)}</time>
                    </div>
                    <p className="mt-0.5 break-words font-mono text-xs text-muted-foreground">{e.detail.slice(0, MAX_DETAIL)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </HoloPanel>
      )}
    </section>
  );
}

function Actions() {
  return (
    <section aria-label="Needs your action" className="space-y-3">
      <HoloHeading level={2} tone="accent" eyebrow="Needs your action" title="GitHub settings only you can switch on" description="These cannot be done or checked from code. Each stays open until you do it in GitHub. Wording follows docs/security.md, last updated 2026-10-25." />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <HoloPanel tone="accent" padded={false}>
          <ol className="divide-y divide-border">
            {GITHUB_ACTIONS.map((it, i) => (
              <li key={it.id} className="flex gap-3 p-4">
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{it.title}</h3>
                    <HoloBadge tone="neutral"><GitBranch className="mr-1 h-3 w-3" aria-hidden />GitHub setting</HoloBadge>
                    <HoloBadge tone="neutral"><CircleHelp className="mr-1 h-3 w-3" aria-hidden />Cannot be verified from code</HoloBadge>
                  </div>
                  <p className="text-sm text-muted-foreground">{it.why}</p>
                </div>
              </li>
            ))}
          </ol>
        </HoloPanel>
        <HoloPanel tone="deep" className="h-fit space-y-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4" style={{ color: 'hsl(var(--holo-c))' }} aria-hidden />
            <h3 className="font-display text-lg font-semibold text-foreground">Enforced in code</h3>
          </div>
          <p className="text-xs text-muted-foreground">These run on the server whatever your GitHub settings are.</p>
          <ul className="space-y-2">
            {ENFORCED_IN_CODE.map((t) => (
              <li key={t} className="flex gap-2 text-sm text-foreground"><StatusDot tone="deep" label="In code" /><span>{t}</span></li>
            ))}
          </ul>
        </HoloPanel>
      </div>
    </section>
  );
}

export function SecurityScreen() {
  const [nonce, setNonce] = React.useState(0);
  const { loading, status, data } = useJson<SecurityStatus>('/api/security/status', nonce);
  return (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={50} />
      <div className="relative mx-auto w-full max-w-6xl space-y-10 p-4 sm:p-8">
        <HoloHeading eyebrow="Security" title="Security Center" description="Facts measured by the server, the events it blocked, and the settings only you can enable. Anything it cannot measure says so." />
        {loading ? (
          <HoloEmpty state="loading" title="Measuring posture" description="Reading approvals, events, headers and scan reports." />
        ) : status === 401 ? (
          <HoloEmpty state="error" title="Sign in to see security status" action={<HoloButton href="/login" size="sm">Sign in</HoloButton>} />
        ) : status !== 200 || !data ? (
          <HoloEmpty state="error" title="Posture is not reported" description="The status endpoint did not answer. Treat every check as not reported." action={<HoloButton size="sm" onClick={() => setNonce((n) => n + 1)}>Try again</HoloButton>} />
        ) : (
          <Hero status={data} onRetry={() => setNonce((n) => n + 1)} />
        )}
        <Timeline />
        <Actions />
      </div>
    </div>
  );
}

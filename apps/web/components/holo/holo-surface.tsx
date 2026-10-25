'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { ClientOnly } from '@/components/client-only';
import { HoloOrbField } from './holo-orb-field';
import { FpsMonitor } from './fps-monitor';
import { fixtureAgents, fixtureTick } from './holo-fixtures';
import { HOLO_ORB_STATES, HOLO_STATE_LABELS, HOLO_STATE_TOKENS, countByState, type HoloAgent } from './holo-types';
import type { HoloStats } from './holo-three-core-rendering';
import { WhinkAvatar } from '../avatar/whink-avatar';
import { AVATAR_STATES, AVATAR_STATE_LABELS, type AvatarState } from '../avatar/avatar-engine';
import { ApprovalDock } from '../neural-link/approval-dock';
import { SecurityEventDisplay, type SecurityEvent } from '../neural-link/security-event-display';
import { ledgerToSecurityEvents } from '../neural-link/security-events';

type Load = 'loading' | 'ready' | 'error' | 'webgl';

// Glass panel style — never raw hex in className
const glassPanel: React.CSSProperties = {
  background: 'rgba(14,21,32,0.78)',
  border: '1px solid rgba(56,182,255,0.16)',
  borderRadius: 16,
  boxShadow: '0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
  backdropFilter: 'blur(12px)',
};

function LiveClock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const dateFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const tick = () => {
      const now = new Date();
      setTime(fmt.format(now));
      setDate(dateFmt.format(now));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="font-mono text-right">
      <div className="text-2xl font-semibold tabular-nums" style={{ color: 'hsl(var(--whink-accent))' }}>{time}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{date} · Calgary</div>
    </div>
  );
}

// Greeting is only rendered inside ClientOnly, so new Date() is safe here — no SSR mismatch.
function Greeting() {
  const hour = new Date(new Date().toLocaleString('en-CA', { timeZone: 'America/Edmonton' })).getHours();
  return <>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}</>;
}

// WHINK wordmark SVG — never hardcoded product name in markup; name from tenant config
function WhinkLogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <circle cx="14" cy="14" r="13" stroke="hsl(var(--whink-accent))" strokeWidth="1.5" />
      <path
        d="M7 9l3 7 4-5 4 5 3-7"
        stroke="hsl(var(--whink-accent))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function HoloSurface() {
  const config = useTenantConfig();
  const productName = config.loading ? 'Your assistant' : config.productName;

  const [load, setLoad] = useState<Load>('loading');
  const [agents, setAgents] = useState<HoloAgent[]>([]);
  const [stats, setStats] = useState<HoloStats | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [eventsLoad, setEventsLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pendingCount, setPendingCount] = useState(0);
  const [preview, setPreview] = useState<AvatarState | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Agent registry — fixture data until real API is wired
  useEffect(() => {
    const t = setTimeout(() => { setAgents(fixtureAgents()); setLoad('ready'); }, 250);
    return () => clearTimeout(t);
  }, [attempt]);

  useEffect(() => {
    if (load !== 'ready') return;
    let seed = 100;
    const t = setInterval(() => { seed += 1; setAgents((a) => fixtureTick(a, seed)); }, 2000);
    return () => clearInterval(t);
  }, [load]);

  const loadEvents = useCallback(() => {
    return fetch('/api/ledger?limit=100')
      .then((r) => { if (!r.ok) throw new Error('ledger_failed'); return r.json() as Promise<unknown>; })
      .then((body) => { setEvents(ledgerToSecurityEvents(body)); setEventsLoad('ready'); })
      .catch(() => setEventsLoad('error'));
  }, []);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  // Pending approval count for the stat tile
  useEffect(() => {
    const poll = () => {
      fetch('/api/approvals?status=AWAITING_APPROVAL')
        .then((r) => { if (!r.ok) throw new Error('approvals_failed'); return r.json() as Promise<{ approvals?: unknown[] }>; })
        .then((d) => { setPendingCount(Array.isArray(d.approvals) ? d.approvals.length : 0); })
        .catch(() => { /* silent — dock shows its own error */ });
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => countByState(agents), [agents]);
  const awaiting = pendingCount > 0 ? pendingCount : counts.awaiting_approval;
  const blocked = counts.blocked;

  const derived: AvatarState = awaiting > 0 ? 'awaiting_approval' : blocked > 0 ? 'blocked' : counts.thinking > 0 ? 'thinking' : 'idle';
  const whinkState = preview ?? derived;

  const hud = useMemo(() => [
    { label: 'WORKING', value: String(counts.working) },
    { label: 'APPROVALS', value: String(awaiting) },
    { label: 'BLOCKED', value: String(blocked) },
  ], [counts.working, awaiting, blocked]);

  // Priority checklist fixture
  const priorities = [
    { done: false, text: 'Review investor deck draft' },
    { done: true,  text: 'Send partnership proposal' },
    { done: false, text: 'Schedule Q4 planning call' },
    { done: false, text: 'Approve MAMBA competitive analysis' },
  ];

  return (
    <div
      className="relative min-h-screen"
      style={{
        background: '#070B12',
      }}
    >
      {/* Radial background gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(1200px 700px at 50% 18%, rgba(11,78,122,0.45), transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1440px] px-6 py-4 space-y-4">

        {/* ── Header ─────────────────────────────────────────────── */}
        <header
          className="flex items-center gap-4 px-5 py-3"
          style={glassPanel}
        >
          {/* Logo + product name — name always from tenant config */}
          <Link href="/dashboard/holo" className="flex items-center gap-2 shrink-0" aria-label={`${productName} home`}>
            <WhinkLogoMark />
            <span className="font-display font-bold text-sm tracking-widest uppercase" style={{ color: 'hsl(var(--whink-accent))' }}>
              {productName}
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1 ml-4 flex-1" aria-label="Main navigation">
            {[
              { label: 'Home', href: '/dashboard/holo' },
              { label: 'Voice', href: '/dashboard/holo/presence' },
              { label: 'Brain', href: '/dashboard/memory' },
              { label: 'Projects', href: '/dashboard' },
              { label: 'Ledger', href: '/dashboard/ledger' },
              { label: 'Connections', href: '/dashboard/connections' },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Search */}
          <div className="relative hidden md:flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <input
              type="search"
              placeholder="Search  ⌘K"
              aria-label="Search"
              className="h-8 w-48 rounded-md border bg-transparent pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1"
              style={{ borderColor: 'rgba(56,182,255,0.2)', '--tw-ring-color': 'hsl(var(--whink-accent))' } as React.CSSProperties}
            />
          </div>

          {/* MAMBA toggle */}
          <Link
            href="/dashboard/holo/obsidian"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors shrink-0"
            style={{
              border: '1px solid hsl(var(--mamba-blood))',
              background: 'rgba(196,30,30,0.08)',
              color: 'hsl(var(--mamba-blood))',
            }}
            aria-label="Switch to MAMBA Obsidian mode"
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: 'hsl(var(--mamba-blood))' }} />
            MAMBA
          </Link>

          {/* Notifications */}
          <button
            type="button"
            className="relative rounded-md p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label={awaiting > 0 ? `${awaiting} pending approvals` : 'Notifications'}
          >
            <Bell className="h-4 w-4" aria-hidden />
            {awaiting > 0 && (
              <span
                aria-hidden
                className="absolute top-1 right-1 h-2 w-2 rounded-full"
                style={{ background: 'hsl(var(--pending-amber))' }}
              />
            )}
          </button>

          {/* Avatar link */}
          <Link
            href="/dashboard/holo/presence"
            className="h-8 w-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold"
            style={{
              background: 'rgba(56,182,255,0.15)',
              border: '1px solid rgba(56,182,255,0.3)',
              color: 'hsl(var(--whink-accent))',
            }}
            aria-label="Voice and presence screen"
          >
            V
          </Link>
        </header>

        {/* ── Three-column layout ─────────────────────────────────── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '320px 1fr 300px' }}>

          {/* ── Left column ──────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Greeting card */}
            <div className="p-5" style={glassPanel}>
              <p className="font-display text-3xl font-bold tracking-tight text-foreground">
                <ClientOnly fallback="Hello, Victor"><Greeting />, Victor</ClientOnly>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Here is what matters today</p>
              <div className="mt-4">
                <ClientOnly fallback={<div className="h-10" />}>
                  <LiveClock />
                </ClientOnly>
              </div>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3">
              {/* Working */}
              <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(56,182,255,0.08)', border: '1px solid rgba(56,182,255,0.2)' }}>
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Working</p>
                <p className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'hsl(var(--whink-accent))' }}>{counts.working}</p>
              </div>
              {/* Priorities */}
              <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(56,182,255,0.08)', border: '1px solid rgba(56,182,255,0.2)' }}>
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Priorities</p>
                <p className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'hsl(var(--whink-accent))' }}>{priorities.filter((p) => !p.done).length}</p>
              </div>
              {/* Pending approvals — amber only */}
              <div
                className="rounded-xl p-3 space-y-1"
                style={{
                  background: awaiting > 0 ? 'rgba(245,166,35,0.08)' : 'rgba(14,21,32,0.5)',
                  border: `1px solid ${awaiting > 0 ? 'rgba(245,166,35,0.3)' : 'rgba(56,182,255,0.1)'}`,
                }}
              >
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Pending</p>
                <p
                  className="font-mono text-2xl font-bold tabular-nums"
                  style={{ color: awaiting > 0 ? 'hsl(var(--pending-amber))' : 'hsl(var(--muted-foreground))' }}
                >
                  {awaiting}
                </p>
                {awaiting > 0 && (
                  <p className="text-xs" style={{ color: 'hsl(var(--pending-amber))' }}>Awaiting approval</p>
                )}
              </div>
              {/* Threats — denial red */}
              <div
                className="rounded-xl p-3 space-y-1"
                style={{
                  background: blocked > 0 ? 'rgba(229,72,77,0.08)' : 'rgba(14,21,32,0.5)',
                  border: `1px solid ${blocked > 0 ? 'rgba(229,72,77,0.3)' : 'rgba(56,182,255,0.1)'}`,
                }}
              >
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Threats</p>
                <p
                  className="font-mono text-2xl font-bold tabular-nums"
                  style={{ color: blocked > 0 ? 'hsl(var(--denial))' : 'hsl(var(--muted-foreground))' }}
                >
                  {blocked}
                </p>
              </div>
            </div>

            {/* Priority checklist */}
            <div className="p-4 space-y-3" style={glassPanel}>
              <h2 className="font-display text-sm font-semibold tracking-tight">Priority checklist</h2>
              <ul className="space-y-2">
                {priorities.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center"
                      aria-hidden
                      style={{
                        borderColor: item.done ? 'rgba(56,182,255,0.4)' : 'rgba(56,182,255,0.2)',
                        background: item.done ? 'rgba(56,182,255,0.15)' : 'transparent',
                      }}
                    >
                      {item.done && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="hsl(var(--whink-accent))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className={item.done ? 'line-through text-muted-foreground' : 'text-foreground'}>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Avatar state debug — collapsed */}
            <details className="rounded-lg p-3 text-xs" style={glassPanel}>
              <summary className="cursor-pointer font-medium text-muted-foreground">Avatar state preview</summary>
              <div role="group" aria-label="Preview avatar state" className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={preview === null}
                  onClick={() => setPreview(null)}
                  className={`rounded px-2 py-1 ${preview === null ? 'bg-accent text-foreground' : 'bg-secondary text-muted-foreground'}`}
                >
                  Live
                </button>
                {AVATAR_STATES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={preview === s}
                    onClick={() => setPreview(s)}
                    className={`rounded px-2 py-1 ${preview === s ? 'bg-accent text-foreground' : 'bg-secondary text-muted-foreground'}`}
                  >
                    {AVATAR_STATE_LABELS[s]}
                  </button>
                ))}
              </div>
            </details>
          </div>

          {/* ── Center column — avatar orbit panel ───────────────── */}
          <div className="space-y-4">
            <div
              className="relative overflow-hidden"
              style={{
                ...glassPanel,
                minHeight: 480,
                background: 'rgba(14,21,32,0.78)',
              }}
            >
              {/* Radial glow behind avatar */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background: 'radial-gradient(500px 400px at 50% 42%, rgba(56,182,255,0.12), transparent 72%)',
                }}
              />

              <div className="relative z-10 flex flex-col items-center pt-6 pb-4 px-4">
                {/* Avatar label + status chip */}
                <div className="flex items-center gap-3 mb-4">
                  <p className="font-display text-sm font-semibold tracking-wide" style={{ color: 'hsl(var(--whink-accent))' }}>
                    {productName} · Chief of Staff
                  </p>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-mono"
                    style={{
                      border: '1px solid rgba(56,182,255,0.3)',
                      background: 'rgba(56,182,255,0.08)',
                      color: 'hsl(var(--whink-accent))',
                    }}
                  >
                    Listening for "{productName}"
                  </span>
                </div>

                {/* Avatar */}
                <div className="flex justify-center">
                  <WhinkAvatar name={productName} state={whinkState} hud={hud} width={240} />
                </div>

                {/* Orb field */}
                <div className="mt-4 w-full" style={{ minHeight: 220 }}>
                  {load === 'loading' && (
                    <div role="status" aria-busy="true" className="flex h-48 items-center justify-center">
                      <div className="h-32 w-32 animate-pulse rounded-full bg-secondary" />
                      <span className="sr-only">Loading agent orbs</span>
                    </div>
                  )}
                  {load === 'ready' && agents.length === 0 && (
                    <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
                      <p className="text-sm font-medium">No agents running</p>
                      <p className="text-xs text-muted-foreground">Agents appear here as orbs once {productName} has some running.</p>
                    </div>
                  )}
                  {(load === 'error' || load === 'webgl') && (
                    <div role="alert" className="flex h-48 flex-col items-center justify-center gap-3 text-center">
                      <AlertTriangle className="h-5 w-5" aria-hidden style={{ color: 'hsl(var(--denial))' }} />
                      <p className="text-xs" style={{ color: 'hsl(var(--denial))' }}>
                        {load === 'webgl' ? 'WebGL unavailable — orb field cannot be displayed.' : 'Error: could not load agents.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => { setLoad('loading'); setStats(null); setAttempt((n) => n + 1); }}
                        className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-foreground hover:opacity-80"
                      >
                        <RefreshCw className="h-3 w-3" aria-hidden /> Retry
                      </button>
                    </div>
                  )}
                  {load === 'ready' && agents.length > 0 && (
                    <div className="h-48 overflow-hidden rounded-lg border border-border bg-card">
                      <HoloOrbField
                        key={attempt}
                        agents={agents}
                        className="h-full w-full"
                        onStats={setStats}
                        onError={() => setLoad('webgl')}
                      />
                    </div>
                  )}
                </div>

                {/* Legend */}
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Orb state legend">
                  {HOLO_ORB_STATES.map((s) => (
                    <li key={s} className="flex items-center gap-1">
                      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: `hsl(var(${HOLO_STATE_TOKENS[s]}))` }} />
                      <span className="text-muted-foreground">{HOLO_STATE_LABELS[s]}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{counts[s]}</span>
                    </li>
                  ))}
                </ul>
                <FpsMonitor stats={stats} />
              </div>
            </div>

            {/* Pending approval feed */}
            {awaiting > 0 && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
                style={{
                  border: '1px solid rgba(245,166,35,0.4)',
                  background: 'rgba(245,166,35,0.06)',
                }}
              >
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: 'hsl(var(--pending-amber))' }} />
                <span className="font-mono font-semibold" style={{ color: 'hsl(var(--pending-amber))' }}>
                  Awaiting approval:
                </span>
                <span className="text-foreground">
                  {awaiting} {awaiting === 1 ? 'action is' : 'actions are'} waiting. Nothing runs until you decide.
                </span>
              </div>
            )}
          </div>

          {/* ── Right column — security + ledger ─────────────────── */}
          <div className="space-y-4">
            <SecurityEventDisplay
              events={events}
              loading={eventsLoad === 'loading'}
              error={eventsLoad === 'error'}
              onRetry={() => { setEventsLoad('loading'); void loadEvents(); }}
            />

            {/* Ledger feed */}
            <div className="p-3 space-y-2" style={glassPanel}>
              <h3 className="font-display text-sm font-semibold tracking-tight">Ledger</h3>
              {events.length === 0 && eventsLoad === 'ready' && (
                <p className="text-xs text-muted-foreground">No ledger events yet.</p>
              )}
              {eventsLoad === 'loading' && (
                <div role="status" aria-busy="true" className="space-y-1.5">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-6 animate-pulse rounded bg-secondary" />
                  ))}
                  <span className="sr-only">Loading ledger</span>
                </div>
              )}
              {eventsLoad === 'ready' && events.length > 0 && (
                <ul className="space-y-1.5 max-h-60 overflow-y-auto" aria-label="Recent ledger events">
                  {events.slice(0, 10).map((e) => (
                    <li key={e.id} className="flex items-start gap-1.5 text-xs">
                      <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'hsl(var(--denial))' }} />
                      <span className="font-mono text-muted-foreground break-all">{e.kind}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Approval dock — fixed position, non-blocking */}
      <ApprovalDock />
    </div>
  );
}

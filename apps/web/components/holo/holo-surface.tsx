'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { HoloOrbField } from './holo-orb-field';
import { FpsMonitor } from './fps-monitor';
import { fixtureAgents, fixtureTick } from './holo-fixtures';
import { HOLO_ORB_STATES, HOLO_STATE_LABELS, HOLO_STATE_TOKENS, countByState, type HoloAgent } from './holo-types';
import type { HoloStats } from './holo-three-core-rendering';
import { WhinkAvatar } from '../avatar/whink-avatar';
import { MambaAvatar } from '../avatar/mamba-avatar';
import { AVATAR_STATES, AVATAR_STATE_LABELS, type AvatarState } from '../avatar/avatar-engine';
import { ApprovalDock } from '../neural-link/approval-dock';
import { SecurityEventDisplay, type SecurityEvent } from '../neural-link/security-event-display';
import { ledgerToSecurityEvents } from '../neural-link/security-events';

type Load = 'loading' | 'ready' | 'error' | 'webgl';

export function HoloSurface() {
  const config = useTenantConfig();
  const productName = config.loading ? 'Your assistant' : config.productName;

  const [load, setLoad] = useState<Load>('loading');
  const [agents, setAgents] = useState<HoloAgent[]>([]);
  const [stats, setStats] = useState<HoloStats | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [eventsLoad, setEventsLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [preview, setPreview] = useState<AvatarState | null>(null);
  const [attempt, setAttempt] = useState(0);

  // TODO(agent registry): replace the sample source with the real agent state API.
  useEffect(() => {
    const t = setTimeout(() => { setAgents(fixtureAgents()); setLoad('ready'); }, 250);
    return () => clearTimeout(t);
  }, [attempt]);

  // Live movement in the sample data so state changes are visible.
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

  const counts = useMemo(() => countByState(agents), [agents]);
  const awaiting = counts.awaiting_approval;
  const blocked = counts.blocked;

  // Avatar state follows live data unless a preview is chosen.
  const derived: AvatarState = awaiting > 0 ? 'awaiting_approval' : blocked > 0 ? 'blocked' : counts.thinking > 0 ? 'thinking' : 'idle';
  const whinkState = preview ?? derived;
  const mambaState: AvatarState = preview ?? 'idle';

  const hud = useMemo(() => [
    { label: 'WORKING', value: String(counts.working) },
    { label: 'APPROVALS', value: String(awaiting) },
    { label: 'BLOCKED', value: String(blocked) },
  ], [counts.working, awaiting, blocked]);

  return (
    <div className="relative mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">HOLO</h1>
        <p className="text-sm text-muted-foreground">
          Every agent working for {productName}, one orb each. Drag to rotate, scroll to zoom.
        </p>
        <p className="text-xs text-muted-foreground">Sample data. The agent registry is not connected yet.</p>
      </header>

      {awaiting > 0 && load === 'ready' && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm"
          style={{ borderColor: 'hsl(var(--pending-amber))' }}
        >
          <Clock className="h-4 w-4" aria-hidden style={{ color: 'hsl(var(--pending-amber))' }} />
          <span className="font-medium" style={{ color: 'hsl(var(--pending-amber))' }}>Awaiting approval:</span>
          <span>{awaiting} {awaiting === 1 ? 'agent is' : 'agents are'} waiting for you. Nothing runs until you decide.</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Agent orbs" className="space-y-3">
          <div className="relative aspect-square max-h-[70vh] w-full overflow-hidden rounded-lg border border-border bg-card">
            {load === 'loading' && (
              <div role="status" aria-busy="true" className="absolute inset-0 flex items-center justify-center">
                <div className="aspect-square h-2/3 animate-pulse rounded-full bg-secondary" />
                <span className="sr-only">Loading agents</span>
              </div>
            )}
            {load === 'ready' && agents.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-6 text-center">
                <p className="font-medium">No agents yet</p>
                <p className="text-sm text-muted-foreground">Agents appear here as orbs once {productName} has some running.</p>
              </div>
            )}
            {(load === 'error' || load === 'webgl') && (
              <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <AlertTriangle className="h-6 w-6 text-[hsl(var(--denial))]" aria-hidden />
                <p className="text-sm text-[hsl(var(--denial))]">
                  {load === 'webgl' ? 'Error: this browser cannot draw the orb field (WebGL unavailable or lost).' : 'Error: could not load agents.'}
                </p>
                <button
                  type="button"
                  onClick={() => { setLoad('loading'); setStats(null); setAttempt((n) => n + 1); }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm text-foreground hover:opacity-80"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
                </button>
              </div>
            )}
            {load === 'ready' && agents.length > 0 && (
              <HoloOrbField
                key={attempt}
                agents={agents}
                className="h-full w-full"
                onStats={setStats}
                onError={() => setLoad('webgl')}
              />
            )}
          </div>

          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Orb state legend">
            {HOLO_ORB_STATES.map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `hsl(var(${HOLO_STATE_TOKENS[s]}))` }} />
                <span className="text-foreground">{HOLO_STATE_LABELS[s]}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{counts[s]}</span>
              </li>
            ))}
          </ul>

          <FpsMonitor stats={stats} />
        </section>

        <aside className="space-y-4" aria-label="Minds and security">
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-1">
            <WhinkAvatar name={productName} state={whinkState} hud={hud} width={280} />
            <MambaAvatar name="Adversarial strategist" state={mambaState} hud={hud} width={280} />
          </div>

          <details className="rounded-lg border border-border bg-card p-3 text-xs">
            <summary className="cursor-pointer font-medium">Avatar state preview</summary>
            <div role="group" aria-label="Preview avatar state" className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={preview === null} onClick={() => setPreview(null)} className={`rounded px-2 py-1 ${preview === null ? 'bg-accent text-foreground' : 'bg-secondary text-muted-foreground'}`}>Live</button>
              {AVATAR_STATES.map((s) => (
                <button key={s} type="button" aria-pressed={preview === s} onClick={() => setPreview(s)} className={`rounded px-2 py-1 ${preview === s ? 'bg-accent text-foreground' : 'bg-secondary text-muted-foreground'}`}>
                  {AVATAR_STATE_LABELS[s]}
                </button>
              ))}
            </div>
          </details>

          <SecurityEventDisplay
            events={events}
            loading={eventsLoad === 'loading'}
            error={eventsLoad === 'error'}
            onRetry={() => { setEventsLoad('loading'); void loadEvents(); }}
          />
        </aside>
      </div>

      <ApprovalDock />
    </div>
  );
}

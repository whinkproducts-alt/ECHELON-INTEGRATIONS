'use client';
// R07 lockdown controls. The server state is the authority (GET/POST /api/safety/lockdown); this component only shows
// it, lets the Founder engage or release it, and tells the browser to drop microphone, camera and audio at once.
// Engage is one click. Release is two steps and names what it will not do (resume stopped work).
import * as React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { setClientLockdown } from '@/lib/safety/client-lockdown';

export interface SafetyView { lockedDown: boolean; epoch: number; reason: string | null; changedAt: string | null; unknown?: boolean }
type Load = { kind: 'loading' } | { kind: 'ready'; state: SafetyView; stale: boolean } | { kind: 'error'; message: string };

const POLL_MS = 15_000;

export function useSafetyState() {
  const [load, setLoad] = React.useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const apply = React.useCallback((state: SafetyView) => {
    setClientLockdown(state.lockedDown);
    setLoad({ kind: 'ready', state, stale: false });
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      const r = await fetch('/api/safety/lockdown', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status === 401 ? 'Sign in again.' : 'Safety state unavailable.');
      const d = (await r.json()) as { state: SafetyView };
      apply(d.state);
    } catch (e) {
      // Keep the last known state but mark it stale; never show "unlocked" for a state we could not read.
      setLoad((l) => (l.kind === 'ready' ? { ...l, stale: true } : { kind: 'error', message: e instanceof Error ? e.message : 'Safety state unavailable.' }));
    }
  }, [apply]);

  React.useEffect(() => {
    void refresh();
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const post = React.useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/safety/lockdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = (await r.json().catch(() => ({}))) as { state?: SafetyView; error?: string };
      if (d.state) apply(d.state);
      if (!r.ok) setError(d.error ?? 'The change was not applied.');
      return r.ok;
    } catch {
      setError('The change was not applied. Check your connection.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [apply]);

  const engage = React.useCallback((reason?: string) => {
    setClientLockdown(true); // stop local media now; the server confirms or the next poll corrects it
    return post({ action: 'engage', ...(reason ? { reason } : {}) });
  }, [post]);
  const release = React.useCallback((expectedEpoch: number) => post({ action: 'release', confirm: 'RELEASE', expectedEpoch }), [post]);

  return { load, busy, error, engage, release, refresh };
}

const SafetyContext = React.createContext<ReturnType<typeof useSafetyState> | null>(null);

export function SafetyProvider({ children }: { children: React.ReactNode }) {
  const value = useSafetyState();
  return <SafetyContext.Provider value={value}>{children}</SafetyContext.Provider>;
}

export function useSafety() {
  const v = React.useContext(SafetyContext);
  if (!v) throw new Error('useSafety must be used inside SafetyProvider');
  return v;
}

/** Compact control for the top bar: one click engages; while locked it shows the state. */
export function LockdownButton() {
  const { load, busy, engage } = useSafety();
  if (load.kind === 'ready' && load.state.lockedDown) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--denial))] px-2 py-1 font-mono text-xs uppercase tracking-wider text-[hsl(var(--denial))]">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Lockdown
      </span>
    );
  }
  return (
    <button type="button" onClick={() => void engage()} disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:border-[hsl(var(--denial))] hover:text-[hsl(var(--denial))] focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      aria-label="Engage lockdown: stop new jobs, outbound actions, cloud models, microphone and camera">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Lockdown</span>
    </button>
  );
}

/** Full-width banner shown on every dashboard screen while locked, with the two-step release. */
export function LockdownBanner() {
  const { load, busy, error, release } = useSafety();
  const [confirming, setConfirming] = React.useState(false);
  if (load.kind === 'error') {
    return <div role="alert" className="border-b border-[hsl(var(--pending-amber))] px-4 py-2 text-xs text-[hsl(var(--pending-amber))]">Safety state could not be read: {load.message} The server treats an unreadable state as locked.</div>;
  }
  if (load.kind !== 'ready' || !load.state.lockedDown) return null;
  const s = load.state;
  return (
    <div role="alert" className="border-b border-[hsl(var(--denial))] bg-[hsl(var(--denial)/0.12)] px-4 py-2 text-sm text-foreground" data-testid="lockdown-banner">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <ShieldAlert className="h-4 w-4 text-[hsl(var(--denial))]" aria-hidden />
        <p className="flex-1 min-w-[16rem]">
          <span className="font-mono text-xs uppercase tracking-wider text-[hsl(var(--denial))]">Lockdown active. </span>
          New jobs, outbound actions, cloud models, microphone and camera are stopped. Review screens and the ledger stay available.
          {s.reason ? <span className="text-muted-foreground"> Reason: {s.reason}</span> : null}
          {load.stale ? <span className="text-[hsl(var(--pending-amber))]"> (status may be out of date)</span> : null}
        </p>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="rounded-md border border-border px-3 py-1 text-xs hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring">Release…</button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Stopped work is not resumed; submit it again after release.</span>
            <button type="button" disabled={busy} onClick={async () => { if (await release(s.epoch)) setConfirming(false); }} className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50">Confirm release</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground">Cancel</button>
          </span>
        )}
        {error && <p role="alert" className="w-full text-xs text-[hsl(var(--denial))]">Error: {error}</p>}
      </div>
    </div>
  );
}

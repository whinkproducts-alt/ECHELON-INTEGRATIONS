/**
 * R07 / item 33: lockdown stops work that is already running, not only new work.
 * Long-running server work (a worker job, a speech stream, a model stream) registers here and gets an AbortSignal.
 * Engaging lockdown aborts every registration for the account in this process (setLockdown calls stopInflight) and
 * writes one ledger row with counts per kind. Work in another process (the worker) uses watchLockdown, which polls
 * the persisted state and aborts the same way. Browser microphone and camera are stopped by client-lockdown.ts.
 */
import { recordActionSafe } from '@/lib/ledger';
import { isLockedDown } from '@/lib/safety/lockdown';

export type InflightKind = 'job' | 'speech' | 'model_stream' | 'media';
interface Entry { kind: InflightKind; ac: AbortController }

const registry = new Map<string, Set<Entry>>();

export function registerInflight(userId: string, kind: InflightKind): { signal: AbortSignal; done: () => void } {
  const entry: Entry = { kind, ac: new AbortController() };
  const set = registry.get(userId) ?? new Set<Entry>();
  registry.set(userId, set.add(entry));
  return {
    signal: entry.ac.signal,
    done: () => { const s = registry.get(userId); s?.delete(entry); if (s && s.size === 0) registry.delete(userId); },
  };
}

/** Abort everything running for the account and ledger it. Returns counts per kind. Never throws. */
export async function stopInflight(userId: string, correlationId: string): Promise<Record<string, number>> {
  const set = registry.get(userId);
  const counts: Record<string, number> = {};
  if (set) {
    for (const e of set) { counts[e.kind] = (counts[e.kind] ?? 0) + 1; try { e.ac.abort(new Error('lockdown')); } catch { /* already aborted */ } }
    registry.delete(userId);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total > 0) {
    await recordActionSafe({
      userId, initiator: 'system', persona: 'WHINK', action: 'lockdown_inflight_stopped', tool: 'safety_lockdown',
      permissionClass: 'A', status: 'EXECUTED',
      inputSummary: Object.entries(counts).map(([k, n]) => `${k}=${n}`).join(' '), outputSummary: 'aborted running work', correlationId,
    });
  }
  return counts;
}

/**
 * For work in a process that cannot see setLockdown (the worker): poll the persisted state and abort `ac`.
 * Fails closed because isLockedDown does. Returns a stop function; always call it in a finally.
 */
export function watchLockdown(userId: string, ac: AbortController, correlationId: string, intervalMs = 2000): () => void {
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped || ac.signal.aborted) return;
    void isLockedDown(userId).then(async (locked) => {
      if (!locked || stopped || ac.signal.aborted) return;
      ac.abort(new Error('lockdown'));
      await recordActionSafe({
        userId, initiator: 'system', persona: 'WHINK', action: 'lockdown_inflight_stopped', tool: 'safety_lockdown',
        permissionClass: 'A', status: 'EXECUTED', inputSummary: 'job=1', outputSummary: 'aborted running work', correlationId,
      });
    }).catch(() => { /* next tick */ });
  }, intervalMs);
  timer.unref?.();
  return () => { stopped = true; clearInterval(timer); };
}

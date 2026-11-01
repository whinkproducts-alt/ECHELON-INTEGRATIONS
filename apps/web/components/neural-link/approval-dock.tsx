'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { ApprovalCard } from '@/app/dashboard/conversation/_components/approval-card';
import {
  approvalReducer, initialCardState, isTerminal, normalizeApproval, postDecision, secondsRemaining,
  type ApprovalView, type CardAction, type CardState,
} from '@/lib/hooks/approval-state';

type Load = 'loading' | 'ready' | 'error';
type Action = { id: string; action: CardAction } | { id: string; init: true };

const POLL_MS = 5000;

/**
 * Bottom right approval dock. Non blocking: it never traps focus, never dims the page,
 * and only its own cards take pointer events. Pending approvals use amber plus a text label.
 * The decision always names the request id (the card posts to /api/approvals/{id}/decision).
 */
export function ApprovalDock() {
  const [load, setLoad] = useState<Load>('loading');
  const [approvals, setApprovals] = useState<ApprovalView[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [cards, dispatch] = useReducer((m: Record<string, CardState>, a: Action) => {
    if ('init' in a) return m[a.id] ? m : { ...m, [a.id]: initialCardState };
    const cur = m[a.id] ?? initialCardState;
    const next = approvalReducer(cur, a.action);
    return next === cur ? m : { ...m, [a.id]: next };
  }, {} as Record<string, CardState>);
  const cardsRef = useRef(cards);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  const add = useCallback((a: ApprovalView) => {
    setApprovals((prev) => (prev.some((p) => p.id === a.id) ? prev : [...prev, a]));
    dispatch({ id: a.id, init: true });
  }, []);

  const poll = useCallback(() => {
    return fetch('/api/approvals?status=pending')
      .then((r) => { if (!r.ok) throw new Error('poll_failed'); return r.json() as Promise<{ approvals?: unknown[] }>; })
      .then((d) => {
        const now = Date.now();
        for (const raw of Array.isArray(d.approvals) ? d.approvals : []) {
          const a = normalizeApproval(raw);
          if (a && secondsRemaining(a.expiresAt, now) > 0) add(a);
        }
        setLoad('ready');
      })
      .catch(() => setLoad('error'));
  }, [add]);

  useEffect(() => {
    const first = setTimeout(() => { void poll(); }, 0);
    const timer = setInterval(() => { void poll(); }, POLL_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [poll]);

  const decide = useCallback((id: string, decision: 'approve' | 'deny', voice?: { code: string }) => {
    if ((cardsRef.current[id] ?? initialCardState).phase !== 'pending') return;
    dispatch({ id, action: { type: 'submit' } });
    postDecision(id, decision, voice)
      .then((response) => dispatch({ id, action: { type: 'response', response } }))
      .catch((e: unknown) => dispatch({ id, action: { type: 'request_failed', message: e instanceof Error ? e.message : 'Request failed' } }));
  }, []);

  const visible = approvals.filter((a) => !dismissed.has(a.id));
  const pending = visible.filter((a) => !isTerminal((cards[a.id] ?? initialCardState).phase)).length;

  return (
    <section
      aria-label="Approvals"
      data-testid="approval-dock"
      className="pointer-events-none fixed bottom-4 right-4 z-30 flex w-[min(26rem,calc(100vw-2rem))] flex-col items-end gap-2"
    >
      {visible.length > 0 && (
        <div className="pointer-events-auto flex max-h-[70vh] w-full flex-col gap-2 overflow-y-auto">
          {visible.map((a) => {
            const st = cards[a.id] ?? initialCardState;
            return (
              <div key={a.id} className="space-y-1 rounded-lg bg-background">
                <ApprovalCard
                  className="w-full"
                  compact
                  approval={a}
                  state={st}
                  onTick={(secondsLeft) => dispatch({ id: a.id, action: { type: 'tick', secondsLeft } })}
                  onDecide={(d, v) => decide(a.id, d, v)}
                />
                {isTerminal(st.phase) && (
                  <button
                    type="button"
                    onClick={() => setDismissed((s) => new Set(s).add(a.id))}
                    className="ml-auto block text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs"
        style={{ boxShadow: 'var(--shadow-md)', borderColor: pending > 0 ? 'hsl(var(--pending-amber))' : undefined }}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden style={{ color: pending > 0 ? 'hsl(var(--pending-amber))' : undefined }} />
        {load === 'loading' && <span className="font-mono text-muted-foreground">Checking approvals…</span>}
        {load === 'error' && (
          <>
            <span className="font-mono text-[hsl(var(--denial))]">Error: approvals unavailable.</span>
            <button type="button" onClick={() => { setLoad('loading'); void poll(); }} className="underline text-foreground">Retry</button>
          </>
        )}
        {load === 'ready' && pending === 0 && <span className="font-mono text-muted-foreground">No approvals pending</span>}
        {load === 'ready' && pending > 0 && (
          <span className="font-mono font-medium" style={{ color: 'hsl(var(--pending-amber))' }}>
            Awaiting approval: {pending}
          </span>
        )}
      </div>
    </section>
  );
}

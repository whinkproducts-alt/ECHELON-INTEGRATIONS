'use client';
// Pending approvals on the Today screen. Reuses the existing ApprovalCard (amber, 30 s countdown, id-bound decisions).
import * as React from 'react';
import { ApprovalCard } from '@/app/dashboard/conversation/_components/approval-card';
import {
  approvalReducer, initialCardState, normalizeApproval, postDecision, secondsRemaining,
  type ApprovalView,
} from '@/lib/hooks/approval-state';
import { generateConfirmationCode } from '@/lib/spoken-approval';
import { HoloBadge, HoloButton, HoloEmpty } from '@/components/ui/holo';

type Load = 'loading' | 'ready' | 'error';
interface Item { approval: ApprovalView; code: string }

function Row({ item }: { item: Item }) {
  const [state, dispatch] = React.useReducer(approvalReducer, initialCardState);
  const ref = React.useRef(state);
  React.useEffect(() => { ref.current = state; }, [state]);
  const decide = (decision: 'approve' | 'deny') => {
    if (ref.current.phase !== 'pending') return;
    dispatch({ type: 'submit' });
    postDecision(item.approval.id, decision)
      .then((response) => dispatch({ type: 'response', response }))
      .catch((e: unknown) => dispatch({ type: 'request_failed', message: e instanceof Error ? e.message : 'Request failed' }));
  };
  return (
    <ApprovalCard
      className="w-full" approval={item.approval} code={item.code} state={state}
      onTick={(secondsLeft) => dispatch({ type: 'tick', secondsLeft })} onDecide={decide}
    />
  );
}

export function PendingApprovals({ onCount }: { onCount?: (n: number | null) => void }) {
  const [load, setLoad] = React.useState<Load>('loading');
  const [items, setItems] = React.useState<Item[]>([]);
  const [tick, setTick] = React.useState(0);
  const countRef = React.useRef(onCount);
  React.useEffect(() => { countRef.current = onCount; }, [onCount]);

  React.useEffect(() => {
    let live = true;
    fetch('/api/approvals?status=pending')
      .then((r) => { if (!r.ok) throw new Error('failed'); return r.json() as Promise<{ approvals?: unknown[] }>; })
      .then((d) => {
        if (!live) return;
        const now = Date.now();
        const fresh = (Array.isArray(d.approvals) ? d.approvals : [])
          .map(normalizeApproval)
          .filter((a): a is ApprovalView => a !== null && secondsRemaining(a.expiresAt, now) > 0);
        setItems((prev) => {
          const known = new Map(prev.map((p) => [p.approval.id, p]));
          // Keep cards the user is mid-decision on (they hold their own state); add new ones.
          for (const a of fresh) if (!known.has(a.id)) known.set(a.id, { approval: a, code: generateConfirmationCode() });
          return [...known.values()];
        });
        setLoad('ready');
        countRef.current?.(fresh.length);
      })
      .catch(() => { if (live) { setLoad('error'); countRef.current?.(null); } });
    return () => { live = false; };
  }, [tick]);

  React.useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  if (load === 'loading') return <HoloEmpty state="loading" title="Checking approvals" />;
  if (load === 'error') {
    return <HoloEmpty state="error" title="Approvals did not load" description="Nothing is waiting that you can see here. Try again."
      action={<HoloButton variant="ghost" onClick={() => { setLoad('loading'); setTick((n) => n + 1); }}>Try again</HoloButton>} />;
  }
  if (items.length === 0) return <HoloEmpty title="No approvals pending" description="When an action needs your yes, it appears here with a 30 second timer." />;
  return (
    <div className="space-y-3">
      <HoloBadge tone="amber" dot pulse>Awaiting approval: {items.length}</HoloBadge>
      {items.map((i) => <Row key={i.approval.id} item={i} />)}
    </div>
  );
}

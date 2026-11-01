'use client';
// Wraps the existing approval card for a change_request_submit approval. Approve and Deny both send the request id.
import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ApprovalCard } from '@/app/dashboard/conversation/_components/approval-card';
import { approvalReducer, initialCardState, postDecision, type ApprovalView } from '@/lib/hooks/approval-state';
import { HoloPanel } from '@/components/ui/holo';

export function ApprovalFlow({ approval, onDecided }: { approval: ApprovalView; onDecided: () => void }) {
  const [card, dispatch] = React.useReducer(approvalReducer, initialCardState);
  const cardRef = React.useRef(card);
  React.useEffect(() => { cardRef.current = card; }, [card]);

  const decide = (decision: 'approve' | 'deny', voice?: { code: string }) => {
    if (cardRef.current.phase !== 'pending') return;
    dispatch({ type: 'submit' });
    postDecision(approval.id, decision, voice)
      .then((response) => { dispatch({ type: 'response', response }); onDecided(); })
      .catch((e: unknown) => dispatch({ type: 'request_failed', message: e instanceof Error ? e.message : 'Request failed' }));
  };

  return (
    <div className="space-y-3">
      <HoloPanel tone="amber" padded className="!p-3" role="note">
        <p className="flex items-start gap-2 text-sm text-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><span className="mr-2 font-mono text-[0.6875rem] uppercase tracking-widest">Awaiting approval</span>
            The exact issue text below is what leaves your account and is posted to the configured GitHub repository. Nothing is sent until you approve request <span className="font-mono">{approval.id}</span> within 30 seconds.</span>
        </p>
      </HoloPanel>
      <ApprovalCard className="w-full" approval={approval} state={card} onTick={(secondsLeft) => dispatch({ type: 'tick', secondsLeft })} onDecide={decide} />
      {card.phase === 'executed' && <p className="text-xs text-muted-foreground" role="status">Sent once, as approved.</p>}
      {(card.phase === 'denied' || card.phase === 'expired') && <p className="text-xs text-muted-foreground" role="status">Nothing was sent. Submit again to create a new approval request.</p>}
    </div>
  );
}

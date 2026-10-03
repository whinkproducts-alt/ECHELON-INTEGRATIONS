'use client';

import { useCallback, useReducer, useRef, useState } from 'react';
import { ApprovalCard } from '../../conversation/_components/approval-card';
import {
  approvalReducer, initialCardState, postDecision, shortResult, type DecisionStatus,
} from '@/lib/hooks/approval-state';
import { generateConfirmationCode } from '@/lib/spoken-approval';
import type { AutonomyApproval } from '@/lib/autonomy-approval';

interface Props {
  approval: AutonomyApproval;
  /** Called once when the approval reaches a final outcome. */
  onResolved: (status: DecisionStatus, detail: string | null) => void;
}

/** Reuses the shared ApprovalCard for an autonomy change. Keyed by approval id by the owner. */
export function AutonomyApprovalPanel({ approval, onResolved }: Props) {
  const [state, dispatch] = useReducer(approvalReducer, initialCardState);
  const [code] = useState(() => generateConfirmationCode());
  const resolved = useRef(false);

  const finish = useCallback((status: DecisionStatus, detail: string | null) => {
    if (resolved.current) return;
    resolved.current = true;
    onResolved(status, detail);
  }, [onResolved]);

  const onDecide = useCallback((decision: 'approve' | 'deny') => {
    if (state.phase !== 'pending') return;
    dispatch({ type: 'submit' });
    postDecision(approval.view.id, decision)
      .then((response) => {
        dispatch({ type: 'response', response });
        finish(response.status, shortResult(response.result));
      })
      .catch((e: unknown) => {
        dispatch({ type: 'request_failed', message: e instanceof Error ? e.message : 'Request failed' });
      });
  }, [state.phase, approval.view.id, finish]);

  const onTick = useCallback((secondsLeft: number) => {
    if (secondsLeft > 0 || state.phase !== 'pending') return;
    dispatch({ type: 'tick', secondsLeft });
    finish('EXPIRED', null);
  }, [finish, state.phase]);

  return (
    <div className="[&>div]:ml-0">
      <ApprovalCard approval={approval.view} state={state} onTick={onTick} onDecide={onDecide} code={code} />
    </div>
  );
}

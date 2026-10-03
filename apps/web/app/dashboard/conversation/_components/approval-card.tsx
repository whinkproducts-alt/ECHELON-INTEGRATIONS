'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import {
  type ApprovalView, type CardState, formatParams, isTerminal, secondsRemaining,
} from '@/lib/hooks/approval-state';

interface ApprovalCardProps {
  approval: ApprovalView;
  state: CardState;
  /** Called every second with seconds left so the owner can expire the card. */
  onTick: (secondsLeft: number) => void;
  onDecide: (decision: 'approve' | 'deny') => void;
}

const AMBER = 'hsl(var(--pending-amber))';
const DENIAL = 'hsl(var(--denial))';
const ACCENT = 'hsl(var(--whink-accent))';

function statusLabel(state: CardState): { text: string; color: string } | null {
  switch (state.phase) {
    case 'executed': return { text: `Executed${state.detail ? `: ${state.detail}` : ''}`, color: ACCENT };
    case 'denied': return { text: 'Denied. Nothing ran.', color: DENIAL };
    case 'already_decided': return { text: 'Already decided. Nothing ran from this card.', color: 'hsl(var(--muted-foreground))' };
    case 'failed': return { text: `Failed${state.detail ? `: ${state.detail}` : ''}`, color: DENIAL };
    case 'expired': return { text: 'Expired — nothing ran', color: 'hsl(var(--muted-foreground))' };
    default: return null;
  }
}

export function ApprovalCard({ approval, state, onTick, onDecide }: ApprovalCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const terminal = isTerminal(state.phase);

  useEffect(() => {
    if (terminal) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      onTick(secondsRemaining(approval.expiresAt, t));
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [terminal, approval.expiresAt, onTick]);

  const secondsLeft = secondsRemaining(approval.expiresAt, now);
  const expired = state.phase === 'expired';
  const busy = state.phase === 'submitting';
  const disabled = busy || terminal;
  const status = statusLabel(state);
  const title = approval.tool ?? (approval.kind === 'ear' ? 'external action request' : 'action');

  return (
    <div
      role="group"
      aria-label={`Approval request: ${title}`}
      className={`ml-10 max-w-2xl rounded-lg border bg-card p-3 space-y-2 ${expired ? 'opacity-50' : ''}`}
      style={{ borderColor: expired ? undefined : (state.phase === 'pending' || busy ? AMBER : undefined) }}
    >
      <div className="flex items-center gap-2 text-xs">
        <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" style={{ color: terminal ? undefined : AMBER }} aria-hidden />
        <span className="font-medium" style={{ color: terminal ? undefined : AMBER }}>
          {terminal ? 'Approval' : 'Awaiting approval'}
        </span>
        <span className="font-mono text-foreground">{title}</span>
        {!terminal && (
          <span
            className="ml-auto font-mono tabular-nums"
            style={{ color: AMBER }}
            aria-live="polite"
            aria-atomic="true"
          >
            Expires in {secondsLeft}s
          </span>
        )}
      </div>

      <p className="text-sm text-foreground whitespace-pre-wrap break-words">{approval.summary}</p>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Exact content that will run</p>
        <pre
          tabIndex={0}
          aria-label="Exact parameters that will run"
          className="font-mono text-xs bg-secondary rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-foreground"
        >
          {formatParams(approval.params)}
        </pre>
      </div>

      {status && (
        <p className="text-xs font-mono break-words" style={{ color: status.color }} role="status">
          {status.text}
        </p>
      )}
      {state.requestError && !terminal && (
        <p className="text-xs font-mono" style={{ color: DENIAL }} role="alert">
          {state.requestError}. Nothing was decided; you can try again.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onDecide('approve')}
          disabled={disabled}
          aria-label={`Approve ${title}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-opacity disabled:opacity-40"
          style={{ color: AMBER, borderColor: AMBER }}
        >
          <Check className="h-3 w-3" aria-hidden /> Approve
        </button>
        <button
          type="button"
          onClick={() => onDecide('deny')}
          disabled={disabled}
          aria-label={`Deny ${title}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-opacity disabled:opacity-40"
          style={{ color: DENIAL, borderColor: DENIAL }}
        >
          <X className="h-3 w-3" aria-hidden /> Deny
        </button>
        {busy && <span className="text-xs text-muted-foreground self-center font-mono">Sending…</span>}
      </div>
    </div>
  );
}

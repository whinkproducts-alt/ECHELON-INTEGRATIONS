'use client';
// Send today's briefing to the user's own phone by SMS. Nothing is sent from here: the button asks the server
// for an approval request, and the existing ApprovalCard (amber, 30 s countdown, protected badge) is where the
// owner approves it by request id. If the server later reports not_configured or failed, the card says so.
import * as React from 'react';
import { MessageSquareText } from 'lucide-react';
import { ApprovalCard } from '@/app/dashboard/conversation/_components/approval-card';
import {
  approvalReducer, initialCardState, normalizeApproval, postDecision,
  type ApprovalView,
} from '@/lib/hooks/approval-state';
import { HoloBadge, HoloButton, HoloPanel } from '@/components/ui/holo';

const E164 = /^\+[1-9]\d{6,14}$/;

type Phase = 'idle' | 'working' | 'need_number' | 'ready' | 'error';

function DecisionCard({ approval }: { approval: ApprovalView }) {
  const [state, dispatch] = React.useReducer(approvalReducer, initialCardState);
  const ref = React.useRef(state);
  React.useEffect(() => { ref.current = state; }, [state]);
  const decide = (decision: 'approve' | 'deny', voice?: { code: string }) => {
    if (ref.current.phase !== 'pending') return;
    dispatch({ type: 'submit' });
    postDecision(approval.id, decision, voice)
      .then((response) => dispatch({ type: 'response', response }))
      .catch((e: unknown) => dispatch({ type: 'request_failed', message: e instanceof Error ? e.message : 'Request failed' }));
  };
  return (
    <ApprovalCard
      className="w-full" approval={approval} state={state}
      onTick={(secondsLeft) => dispatch({ type: 'tick', secondsLeft })} onDecide={decide}
    />
  );
}

export function SmsBriefingCard() {
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [approval, setApproval] = React.useState<ApprovalView | null>(null);
  const [preview, setPreview] = React.useState('');
  const [message, setMessage] = React.useState<string | null>(null);
  const [number, setNumber] = React.useState('');

  const request = React.useCallback(async () => {
    setPhase('working');
    setMessage(null);
    try {
      const res = await fetch('/api/briefing/sms', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { approval?: unknown; preview?: unknown; error?: unknown };
      if (res.status === 400 && data.error === 'no_sms_number') { setPhase('need_number'); return; }
      if (res.status === 429) { setMessage('Too many requests. Wait a minute and try again.'); setPhase('error'); return; }
      const a = normalizeApproval(data.approval);
      if (!res.ok || !a) { setMessage('The briefing could not be prepared. Nothing was sent.'); setPhase('error'); return; }
      setApproval(a);
      setPreview(typeof data.preview === 'string' ? data.preview : '');
      setPhase('ready');
    } catch {
      setMessage('The briefing could not be prepared. Nothing was sent.');
      setPhase('error');
    }
  }, []);

  const saveNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = number.trim();
    if (!E164.test(address)) { setMessage('Use international format, for example +14035550123.'); return; }
    setPhase('working');
    setMessage(null);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'SMS', enabled: true, address }),
      });
      if (!res.ok) { setMessage('The number could not be saved.'); setPhase('need_number'); return; }
      await request();
    } catch {
      setMessage('The number could not be saved.');
      setPhase('need_number');
    }
  };

  return (
    <HoloPanel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 font-display text-base text-foreground">
            <MessageSquareText className="h-4 w-4" aria-hidden />Send today&apos;s briefing to my phone by SMS
          </h3>
          <p className="text-xs text-muted-foreground">Goes to your own number. Nothing is sent until you approve the exact text below.</p>
        </div>
        {phase !== 'ready' && phase !== 'need_number' && (
          <HoloButton onClick={request} loading={phase === 'working'}>Send briefing</HoloButton>
        )}
      </div>

      {phase === 'need_number' && (
        <form onSubmit={saveNumber} className="mt-4 space-y-2">
          <label htmlFor="sms-briefing-number" className="block font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Your mobile number</label>
          <div className="flex flex-wrap gap-2">
            <input
              id="sms-briefing-number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+14035550123"
              value={number} onChange={(e) => setNumber(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            />
            <HoloButton type="submit">Save and continue</HoloButton>
          </div>
        </form>
      )}

      {message && <p role="alert" className="mt-3 text-sm text-muted-foreground">{message}</p>}

      {phase === 'ready' && approval && (
        <div className="mt-4 space-y-3">
          <HoloBadge tone="amber" dot>Waiting for your approval</HoloBadge>
          {preview && (
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-background/40 p-3 font-mono text-xs text-foreground">{preview}</pre>
          )}
          <DecisionCard approval={approval} />
        </div>
      )}
    </HoloPanel>
  );
}

export default SmsBriefingCard;

'use client';

import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, Check, X, Mic, Volume2 } from 'lucide-react';
import { useDecisionListener } from '@/lib/hooks/useDecisionListener';
import {
  type ApprovalView, type CardState, formatParams, isTerminal, secondsRemaining,
} from '@/lib/hooks/approval-state';

interface ApprovalCardProps {
  approval: ApprovalView;
  state: CardState;
  /** Called every second with seconds left so the owner can expire the card. */
  onTick: (secondsLeft: number) => void;
  onDecide: (decision: 'approve' | 'deny') => void;
  /** 4-digit confirmation code, generated client-side. Never sent to the server or the model. */
  code: string;
  /** Layout override. Defaults to the inline conversation layout. */
  className?: string;
  /** Dock mode: the voice controls start collapsed. The exact content is always shown. */
  compact?: boolean;
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

async function ttsReadAloud(text: string) {
  try {
    const res = await fetch('/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.status === 501) {
      // Server has no TTS provider — browser fallback
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      }
      return;
    }
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener('ended', () => URL.revokeObjectURL(url));
    await audio.play();
  } catch {
    // Degrade silently
  }
}

export function ApprovalCard({ approval, state, onTick, onDecide, code, className, compact = false }: ApprovalCardProps) {
  // null until the first tick: Date.now() in a state initializer breaks SSR hydration (eslint.ssr.config.mjs).
  const [now, setNow] = useState<number | null>(null);
  const terminal = isTerminal(state.phase);
  const handleReadAloud = useCallback(() => {
    void ttsReadAloud(`${approval.tool ?? 'Action'}: ${approval.summary}`);
  }, [approval.tool, approval.summary]);

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

  const secondsLeft = now === null ? 30 : secondsRemaining(approval.expiresAt, now);
  const expired = state.phase === 'expired';
  const busy = state.phase === 'submitting';
  const disabled = busy || terminal;
  const status = statusLabel(state);
  const voice = useDecisionListener({ code, onDecision: onDecide, disabled });
  const title = approval.tool ?? (approval.kind === 'ear' ? 'external action request' : 'action');

  return (
    <div
      role="group"
      aria-label={`Approval request: ${title}`}
      className={`${className ?? 'ml-10 max-w-2xl'} rounded-lg border bg-card p-3 space-y-2 ${expired ? 'opacity-50' : ''}`}
      style={{ borderColor: expired ? undefined : (state.phase === 'pending' || busy ? AMBER : undefined) }}
    >
      <div className="flex items-center gap-2 text-xs">
        <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" style={{ color: terminal ? undefined : AMBER }} aria-hidden />
        <span className="font-medium" style={{ color: terminal ? undefined : AMBER }}>
          {terminal ? 'Approval' : 'Awaiting approval'}
        </span>
        <span className="font-mono text-foreground">{title}</span>
        <button
          type="button"
          aria-label="Read aloud"
          title="Read action description aloud"
          onClick={handleReadAloud}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <Volume2 className="h-3.5 w-3.5" aria-hidden />
        </button>
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

      {!terminal && (
        <div
          role="progressbar"
          aria-label="Time left to decide"
          aria-valuemin={0}
          aria-valuemax={30}
          aria-valuenow={Math.min(30, secondsLeft)}
          aria-valuetext={`${secondsLeft} seconds left`}
          className="h-1 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full"
            style={{ width: `${Math.min(100, (secondsLeft / 30) * 100)}%`, background: AMBER, transition: 'width 1s linear' }}
          />
        </div>
      )}

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

      {!terminal && (
        <details open={!compact} className="space-y-1.5 rounded-md border border-border p-2">
          <summary className={compact ? 'cursor-pointer text-xs text-muted-foreground' : 'hidden'}>Voice approval</summary>
          <p className="text-xs text-muted-foreground">
            Voice: hold the button and say &quot;approve&quot; followed by this code, or say &quot;deny&quot;.
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Confirmation code</span>
            <span
              className="font-mono text-lg tracking-widest tabular-nums text-foreground"
              aria-label={`Confirmation code ${code.split('').join(' ')}`}
            >
              {code}
            </span>
          </div>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={voice.listening}
            aria-label="Hold to speak decision. Press and hold Space, or press Enter to start and stop."
            onPointerDown={(e) => { e.preventDefault(); voice.begin(); }}
            onPointerUp={voice.end}
            onPointerCancel={voice.end}
            onPointerLeave={voice.end}
            onKeyDown={(e) => {
              if (e.repeat) return;
              if (e.key === ' ') { e.preventDefault(); voice.begin(); }
              else if (e.key === 'Enter') { e.preventDefault(); voice.toggle(); }
            }}
            onKeyUp={(e) => { if (e.key === ' ') { e.preventDefault(); voice.end(); } }}
            onBlur={voice.end}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-opacity disabled:opacity-40"
            style={{ color: ACCENT, borderColor: ACCENT }}
          >
            <Mic className="h-3 w-3" aria-hidden />
            {voice.listening ? 'Listening\u2026 release to send' : 'Hold to speak decision'}
          </button>
          {voice.listening && (
            <p className="text-xs font-mono" style={{ color: ACCENT }} role="status">
              Microphone live. Release to stop.
            </p>
          )}
          {voice.message && !voice.listening && (
            <p className="text-xs font-mono text-muted-foreground" role="status">{voice.message}</p>
          )}
        </details>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onDecide('approve')}
          disabled={disabled}
          aria-label={`Approve ${title}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-opacity disabled:opacity-40"
          style={{ color: ACCENT, borderColor: ACCENT }}
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

'use client';

import { ShieldAlert, ShieldX, Ban } from 'lucide-react';

export type SecurityEventKind = 'injection_blocked' | 'action_blocked' | 'approval_hash_mismatch' | 'cross_tenant_attempt';

export interface SecurityEvent {
  id: string;
  kind: SecurityEventKind;
  /** Plain text only. Rendered as text, never as HTML, because it may echo untrusted content. */
  detail: string;
  ts: number;
}

const META: Record<SecurityEventKind, { label: string; icon: typeof ShieldAlert; explain: string }> = {
  injection_blocked: { label: 'Injection blocked', icon: ShieldX, explain: 'The message was not sent to the model.' },
  action_blocked: { label: 'Action blocked', icon: Ban, explain: 'The permission engine refused it. Nothing ran.' },
  approval_hash_mismatch: { label: 'Approval hash mismatch', icon: ShieldAlert, explain: 'Parameters changed after approval. Nothing ran.' },
  cross_tenant_attempt: { label: 'Cross account attempt', icon: ShieldAlert, explain: 'Another account’s request id was refused.' },
};

const MAX_DETAIL = 240;

function formatClock(ts: number): string {
  // Explicit UTC so server and client agree (SSR safety).
  return new Date(ts).toISOString().slice(11, 19) + ' UTC';
}

interface Props {
  events: readonly SecurityEvent[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

/**
 * Security events from the SSE `security` event and ledger rows.
 * Denial token plus an icon plus a text label: colour never carries meaning alone.
 */
export function SecurityEventDisplay({ events, loading = false, error = false, onRetry }: Props) {
  return (
    <section aria-label="Security events" className="rounded-lg border border-border bg-card p-3 space-y-2">
      <h3 className="font-display text-sm font-semibold tracking-tight">Security events</h3>

      {loading && (
        <div role="status" aria-busy="true" className="space-y-1.5">
          <div className="h-8 animate-pulse rounded bg-secondary" />
          <div className="h-8 animate-pulse rounded bg-secondary" />
          <span className="sr-only">Loading security events</span>
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="space-y-1.5 text-xs">
          <p className="text-[hsl(var(--denial))]">Error: could not load security events.</p>
          {onRetry && <button type="button" onClick={onRetry} className="rounded-md bg-secondary px-3 py-1 text-foreground hover:opacity-80">Retry</button>}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="text-xs text-muted-foreground">No security events. Blocked injections and refused actions appear here.</p>
      )}

      {!loading && !error && events.length > 0 && (
        <ul className="space-y-1.5" aria-live="polite">
          {[...events].sort((a, b) => b.ts - a.ts).slice(0, 20).map((e) => {
            const m = META[e.kind];
            const Icon = m.icon;
            return (
              <li key={e.id} className="flex items-start gap-2 rounded border border-[hsl(var(--denial))] p-2 text-xs">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--denial))]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold uppercase text-[hsl(var(--denial))]">{m.label}</p>
                  <p className="text-muted-foreground">{m.explain}</p>
                  {e.detail && <p className="mt-0.5 break-words font-mono text-foreground">{e.detail.length > MAX_DETAIL ? `${e.detail.slice(0, MAX_DETAIL)}…` : e.detail}</p>}
                </div>
                <time className="shrink-0 font-mono tabular-nums text-muted-foreground" dateTime={new Date(e.ts).toISOString()}>{formatClock(e.ts)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

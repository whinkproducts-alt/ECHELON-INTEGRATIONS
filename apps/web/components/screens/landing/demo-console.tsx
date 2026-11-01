'use client';
// Read-only sample. Static fake data only; nothing here talks to the server or can be operated.
import { cn } from '@/lib/utils';
import { DEMO } from './landing-data';
import styles from './landing.module.css';

function CountdownRing() {
  return (
    <div className="relative h-14 w-14 shrink-0" aria-hidden>
      <div className={cn('absolute inset-0 rounded-full', styles.ringAmber)} />
      <div className={cn('absolute inset-0', styles.hand)}>
        <span className="absolute left-1/2 top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground" />
      </div>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm tabular-nums text-foreground">{DEMO.windowSeconds}s</span>
    </div>
  );
}

export function DemoConsole() {
  return (
    <section aria-label="Sample console. Not live." className="flex w-full flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Sample console</p>
        <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">Sample, not live</span>
      </header>

      <div className="flex flex-col gap-3">
        <div className={cn('ml-auto max-w-[88%] rounded-lg bg-secondary px-4 py-3 text-sm text-foreground', styles.rise)} style={{ '--d': '120ms' } as React.CSSProperties}>
          <span className="sr-only">You: </span>{DEMO.you}
        </div>
        <div className={cn('max-w-[92%] rounded-lg border border-border px-4 py-3 text-sm text-foreground', styles.rise)} style={{ '--d': '320ms' } as React.CSSProperties}>
          <span className="sr-only">Assistant: </span>{DEMO.reply}
        </div>
      </div>

      <div className={cn('flex flex-col gap-4 rounded-lg border border-[hsl(var(--pending-amber))] p-4', styles.rise)} style={{ '--d': '520ms' } as React.CSSProperties}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[hsl(var(--pending-amber))] px-2.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wider text-[hsl(var(--pending-amber))]">
              <span className={cn('h-1.5 w-1.5 rounded-full bg-[hsl(var(--pending-amber))]', styles.pulse)} aria-hidden />
              Awaiting approval
            </span>
            <p className="font-display text-lg font-semibold tracking-tight text-foreground">{DEMO.approvalAction}</p>
            <p className="font-mono text-sm text-muted-foreground">{DEMO.approvalDetail}</p>
          </div>
          <CountdownRing />
        </div>
        <div className="flex gap-2" aria-hidden>
          <span className="inline-flex min-h-10 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground opacity-60">Approve</span>
          <span className="inline-flex min-h-10 flex-1 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground opacity-60">Deny</span>
        </div>
        <p className="text-xs text-muted-foreground">An approval names its request and lasts {DEMO.windowSeconds} seconds. This card is a sample and cannot be used.</p>
      </div>

      <p className="flex items-start gap-3 border-t border-border pt-4 font-mono text-xs text-muted-foreground">
        <span className="shrink-0 tabular-nums text-foreground">{DEMO.time}</span>
        <span>{DEMO.ledgerLine}</span>
      </p>
    </section>
  );
}

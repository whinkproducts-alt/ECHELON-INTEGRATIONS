import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STEPS, statusLabel, stepIndex, type ChangeRequest } from './types';

/** Progress through the flow. State is always written out (Done, Now, Next), never colour alone. */
export function Stepper({ cr }: { cr: Pick<ChangeRequest, 'status' | 'spec' | 'githubIssueUrl'> }) {
  const at = stepIndex(cr);
  const stopped = cr.status === 'REJECTED' || cr.status === 'FAILED';
  return (
    <div>
      <ol aria-label="Change request progress" className="grid gap-2 sm:grid-cols-7">
        {STEPS.map((s, i) => {
          const done = i < at || (i === at && cr.status === 'MERGED');
          const now = i === at && !done && !stopped;
          const tag = done ? 'Done' : now ? 'Now' : stopped && i === at ? 'Stopped here' : 'Next';
          return (
            <li key={s.key} aria-current={now ? 'step' : undefined}
              className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs sm:flex-col sm:items-start', now ? 'border-primary bg-primary/10' : 'border-border', done ? 'text-foreground' : now ? 'text-foreground' : 'text-muted-foreground')}>
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[0.625rem]', done ? 'border-primary bg-primary/20' : 'border-border')} aria-hidden>
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{s.label}</span>
                <span className="block font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">{tag}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {stopped && <p className="mt-2 text-xs text-foreground" role="status"><span className="mr-2 font-mono uppercase tracking-widest text-[hsl(var(--ember))]">{statusLabel(cr.status)}</span>This request stopped. It is not merged.</p>}
    </div>
  );
}

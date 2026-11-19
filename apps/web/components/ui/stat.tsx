import * as React from 'react';
import { cn } from '@/lib/utils';

export interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}

export function Stat({ label, value, hint, className }: StatProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-medium tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

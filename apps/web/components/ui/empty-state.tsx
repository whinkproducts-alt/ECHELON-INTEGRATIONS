import * as React from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  /** One line saying how this view gets populated. */
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div role="status" className={cn('flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center', className)}>
      {icon && <div aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

import { cn } from '@/lib/utils';

/** Loading placeholder. Shimmer is disabled under prefers-reduced-motion (see globals.css). */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('skeleton-shimmer rounded-md', className)} {...props} />;
}

export { Skeleton };

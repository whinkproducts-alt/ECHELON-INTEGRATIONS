'use client';
// BrandLockup props: orientation?: 'horizontal'|'vertical' (default horizontal), markSize?: number (default 56), showDescriptions?: boolean (default true), className
// Shows Group -> Apps -> Ultimate with the relationship text read from config/companies.json. Stacks on phone widths.
import * as React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark } from './brand-mark';
import { getCompanies } from './companies';

export function BrandLockup({ orientation = 'horizontal', markSize = 56, showDescriptions = true, className }: { orientation?: 'horizontal' | 'vertical'; markSize?: number; showDescriptions?: boolean; className?: string }) {
  const list = getCompanies();
  const horizontal = orientation === 'horizontal';
  return (
    <ol className={cn('flex items-stretch gap-3', horizontal ? 'flex-col md:flex-row md:items-start' : 'flex-col', className)} aria-label="Company relationship">
      {list.map((c, i) => (
        <React.Fragment key={c.id}>
          <li className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <BrandMark company={c.id} size={markSize} />
            <p className="font-display text-sm font-semibold tracking-wide text-foreground">{c.name}</p>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">{c.role}</p>
            {showDescriptions && <p className="max-w-xs text-xs text-muted-foreground">{c.description}</p>}
          </li>
          {i < list.length - 1 && (
            <li aria-hidden className="flex items-center justify-center self-center text-primary md:mt-6">
              {horizontal ? <><ChevronDown className="h-5 w-5 md:hidden" /><ChevronRight className="hidden h-5 w-5 md:block" /></> : <ChevronDown className="h-5 w-5" />}
            </li>
          )}
        </React.Fragment>
      ))}
    </ol>
  );
}

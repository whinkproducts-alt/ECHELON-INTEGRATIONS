import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { findSubsidiary } from './subsidiary-map';

export interface SubsidiaryChipProps {
  /** Subsidiary id, or null/undefined for an unassigned project. */
  id: string | null | undefined;
  href?: string;
  className?: string;
}

const BASE = 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary/50 py-0.5 pl-0.5 pr-2.5 text-xs text-foreground';

export function SubsidiaryChip({ id, href, className = '' }: SubsidiaryChipProps) {
  const sub = findSubsidiary(id);
  const inner = sub ? (
    <>
      <Image src={sub.logo} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full object-cover" />
      <span className="truncate">{sub.name}</span>
    </>
  ) : (
    <>
      <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Building2 className="h-3 w-3" /></span>
      <span className="truncate text-muted-foreground">Unassigned</span>
    </>
  );
  const cls = `${BASE} ${href ? 'hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring' : ''} ${className}`;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <span className={cls}>{inner}</span>;
}

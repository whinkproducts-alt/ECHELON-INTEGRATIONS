'use client';
// BrandMark props: company: 'group'|'apps'|'ultimate', size?: number (rendered height in px, default 40), showName?: boolean, glow?: boolean (default true), crop?: 'glyph' (square logos only: zooms to the monogram), className
// Logo and name come from config/companies.json. If the company url is null a subtle "link not set" tooltip shows and nothing is clickable;
// if set it is a real external link (target=_blank, rel=noopener noreferrer). Logos have black backgrounds, blended with screen mode.
import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getCompany, type CompanyId } from './companies';

export interface BrandMarkProps {
  company: CompanyId;
  size?: number;
  showName?: boolean;
  glow?: boolean;
  /** 'glyph' crops a square logo to its monogram so it stays recognisable at small sizes. */
  crop?: 'glyph';
  className?: string;
  /** false renders a plain image with no link or tooltip, for use inside another link (nested anchors are invalid HTML). */
  interactive?: boolean;
}

export function BrandMark({ company, size = 40, showName = false, glow = true, crop, className, interactive = true }: BrandMarkProps) {
  const c = getCompany(company);
  const cropped = crop === 'glyph' && c.aspect === 1;
  const w = cropped ? size : Math.round(size * c.aspect);
  // Monogram window inside the square master (fractions of its side), measured from the artwork.
  const GLYPH = { x: 0.148, y: 0.032, side: 0.686 };
  const zoom = 1 / GLYPH.side;
  const content = (
    <>
      <span className={cn('relative inline-flex shrink-0 overflow-hidden rounded-md transition-[filter,transform] duration-normal group-hover:scale-105', glow && 'group-hover:[filter:drop-shadow(0_0_10px_hsl(var(--whink-accent)/0.7))]')} style={{ width: w, height: size }}>
        {cropped ? (
          <Image
            src={c.logo} alt={showName ? '' : c.name} width={1254} height={1254} sizes={`${Math.round(size * zoom)}px`} quality={90} priority
            className="holo-brand-img absolute max-w-none object-cover"
            style={{ width: size * zoom, height: size * zoom, left: -GLYPH.x * size * zoom, top: -GLYPH.y * size * zoom }}
          />
        ) : (
          <Image src={c.logo} alt={showName ? '' : c.name} width={w * 2} height={size * 2} sizes={`${w}px`} className="holo-brand-img h-full w-full object-contain" />
        )}
      </span>
      {showName && <span className="font-display text-sm font-semibold tracking-wide text-foreground">{c.name}</span>}
    </>
  );
  const base = cn('group relative inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring', className);
  if (!interactive) {
    return <span className={cn('inline-flex items-center gap-2', className)}>{content}</span>;
  }
  if (c.url) {
    return (
      <a href={c.url} target="_blank" rel="noopener noreferrer" className={base} aria-label={`${c.name} (opens in a new tab)`}>
        {content}
      </a>
    );
  }
  return (
    <span className={base} title="link not set">
      {content}
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-popover px-2 py-0.5 font-mono text-[0.625rem] text-muted-foreground opacity-0 transition-opacity duration-fast group-hover:opacity-100">
        link not set
      </span>
    </span>
  );
}

'use client';
// HoloGrid props: fit?: boolean (stretch to fill the row when there are few items), min?: string (min card width, CSS length, default '16rem'), gap?: string (CSS length, default '1rem'), as?: 'div'|'ul', className, children
// Responsive auto-fill grid; children rise in with a short stagger. Single column on phones narrower than min.
import * as React from 'react';
import { cn } from '@/lib/utils';

export function HoloGrid({ min = '16rem', gap = '1rem', as = 'div', fit = false, className, children }: { fit?: boolean; min?: string; gap?: string; as?: 'div' | 'ul'; className?: string; children: React.ReactNode }) {
  const Tag = as as React.ElementType;
  return (
    <Tag data-fit={fit ? 'true' : undefined} className={cn('holo-grid', className)} style={{ '--holo-grid-min': `min(100%, ${min})`, gap } as React.CSSProperties}>
      {children}
    </Tag>
  );
}

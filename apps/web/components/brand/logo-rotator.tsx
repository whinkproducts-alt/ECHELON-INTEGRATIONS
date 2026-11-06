'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { getCompany } from './companies';
import { logoBag } from '@/lib/brand/logo-sequence';

/** Resting identity artwork only. No status or live-data semantics. */
export function LogoRotator() {
  const company = getCompany('ultimate');
  const sources = useMemo(() => company.logoVariants ?? [company.logo], [company]);
  const root = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({current:0, previous:null as number | null});
  useEffect(() => {
    const element = root.current;
    if (!element || sources.length < 2) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let current = 0;
    let queue = logoBag(sources.length, -1).filter(index => index !== 0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const preload = () => { const image = new window.Image(); image.src = sources[queue[0]]; };
    const schedule = () => {
      clearTimeout(timer);
      if (!visible || document.hidden || media.matches) return;
      preload();
      timer = setTimeout(() => {
        const next = queue.shift()!;
        const previous = current;
        current = next;
        if (!queue.length) queue = logoBag(sources.length, current);
        setFrame({current, previous});
        schedule();
      }, 5000 + Math.random() * 3000);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); });
    observer.observe(element);
    document.addEventListener('visibilitychange', schedule);
    media.addEventListener('change', schedule);
    return () => { clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', schedule); media.removeEventListener('change', schedule); };
  }, [sources]);
  return <div ref={root} className="brand-resting-art" aria-label={company.name} role="img">
    {frame.previous !== null && <Image key={`previous-${frame.previous}`} src={sources[frame.previous]} alt="" fill unoptimized sizes="280px" className="object-contain" aria-hidden />}
    <Image key={frame.current} loading="eager" src={sources[frame.current]} alt="" fill unoptimized sizes="280px" className="brand-resting-current object-contain" aria-hidden />
  </div>;
}

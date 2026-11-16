'use client';
import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/brand';
import tenant from '@/config/tenant-defaults.json';
import styles from './warp-opening.module.css';

const SEEN_KEY = 'warp-opening-seen';
const warp = (tenant as { warp?: { enabled: boolean; oncePerSession: boolean; showHint: boolean } }).warp ?? { enabled: true, oncePerSession: true, showHint: true };

/** Item 25. Opening screen over the login page. Silent. Any click, key or touch continues; reduced motion skips it; a failure never blocks login. */
export function WarpOpening() {
  const [open, setOpen] = useState(warp.enabled);
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const close = () => {
    try { if (warp.oncePerSession) sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
    setOpen(false);
  };

  useEffect(() => {
    let skip = false;
    try { skip = window.matchMedia('(prefers-reduced-motion: reduce)').matches || (warp.oncePerSession && !!sessionStorage.getItem(SEEN_KEY)); } catch { /* show it */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only check, cannot run during SSR
    if (skip) { setOpen(false); return; }
    setReady(true);
    const onKey = () => close();
    window.addEventListener('keydown', onKey);
    const cv = canvas.current, el = root.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !el || !ctx) return () => window.removeEventListener('keydown', onKey);
    // Star colours come from design tokens via computed style, not literals.
    const c1 = getComputedStyle(el).color;
    const c2 = getComputedStyle(el.querySelector('[data-accent]') as Element).color;
    let seed = 719431;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const stars = Array.from({ length: 240 }, (_, i) => ({ a: rnd() * Math.PI * 2, o: rnd(), s: 0.24 + rnd() * 0.22, w: 0.4 + rnd() * 0.6, c: i % 3 ? c1 : c2 }));
    let raf = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      const w = (cv.width = cv.clientWidth), h = (cv.height = cv.clientHeight);
      const t = (now - t0) / 1000, cx = w / 2, cy = h / 2, reach = Math.hypot(w, h) * 0.72;
      ctx.lineCap = 'round';
      for (const s of stars) {
        const p = (s.o + t * s.s) % 1, r = (0.02 + Math.pow(p, 1.85)) * reach, tail = r * (1 - (0.09 + p * 0.2));
        ctx.globalAlpha = 0.12 + p * 0.73; ctx.strokeStyle = s.c; ctx.lineWidth = s.w + p * 0.8;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(s.a) * tail, cy + Math.sin(s.a) * tail); ctx.lineTo(cx + Math.cos(s.a) * r, cy + Math.sin(s.a) * r); ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }, []);

  if (!open) return null;
  return (
    <div ref={root} className={styles.overlay} data-ready={ready ? '' : undefined} role="button" tabIndex={0} aria-label="Continue to sign in" onClick={close} onTouchStart={close}>
      <noscript><style>{'[data-warp-overlay]{display:none}'}</style></noscript>
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      <div className={styles.portal} aria-hidden="true" data-warp-overlay=""><BrandMark company="ultimate" size={120} glow={false} interactive={false} /></div>
      <h1 className={styles.tagline} data-accent>{tenant.tagline}</h1>
      {warp.showHint && <p className={styles.hint}>Click anywhere to continue</p>}
    </div>
  );
}

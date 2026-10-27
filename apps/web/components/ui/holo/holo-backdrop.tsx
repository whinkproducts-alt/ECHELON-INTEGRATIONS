'use client';
// HoloOrbBackdrop props: stars?: number (default 80, capped 160), floor?: boolean (perspective grid, default true), orb?: boolean (glow, default true), className
// Place inside a relative container; it is absolutely positioned, pointer-events none, aria-hidden. One small canvas, paused when the tab is hidden.
// prefers-reduced-motion: stars draw once and nothing animates. Random values are only generated inside the effect (SSR safe).
import * as React from 'react';
import { cn } from '@/lib/utils';

interface Star { x: number; y: number; z: number; tw: number }

export function HoloOrbBackdrop({ stars = 80, floor = true, orb = true, className }: { stars?: number; floor?: boolean; orb?: boolean; className?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const count = Math.min(160, Math.max(0, stars));
    const field: Star[] = Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), tw: Math.random() * Math.PI * 2 }));
    const token = getComputedStyle(canvas).getPropertyValue('--whink-accent').trim() || '203 100% 61%';
    let w = 0; let h = 0; let raf = 0; let last = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr)); canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of field) {
        const a = reduced ? 0.4 + s.z * 0.4 : 0.25 + 0.55 * s.z * (0.6 + 0.4 * Math.sin(t / 1100 + s.tw));
        const drift = reduced ? 0 : (t / 90000) * (0.2 + s.z);
        const x = ((s.x + drift) % 1) * w;
        ctx.fillStyle = `hsl(${token} / ${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, s.y * h, 0.4 + s.z * 1.3, 0, Math.PI * 2); ctx.fill();
      }
    };
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 40) return; // ~25fps is plenty for a starfield
      last = t; draw(t);
    };
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduced) raf = requestAnimationFrame(loop); };
    resize(); draw(0);
    if (!reduced) raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => { resize(); draw(last); });
    ro.observe(canvas);
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [stars]);
  return (
    <div className={cn('holo-backdrop', className)} aria-hidden>
      {orb && <div className="holo-orb" />}
      <canvas ref={ref} />
      {floor && <div className="holo-floor"><div><div /></div></div>}
    </div>
  );
}

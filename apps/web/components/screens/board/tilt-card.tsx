'use client';
// TiltCard: slow parallax tilt plus a cursor-following light. Transform and opacity only.
// Pointer handlers write CSS variables; nothing random or time based runs in render (SSR safe).
// Tilt and light are skipped for touch pointers and for prefers-reduced-motion.
import * as React from 'react';
import { cn } from '@/lib/utils';

export function TiltCard({ children, className, max = 7 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const b = el.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width;
    const py = (e.clientY - b.top) / b.height;
    el.style.setProperty('--tilt-x', `${((0.5 - py) * max).toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${((px - 0.5) * max).toFixed(2)}deg`);
    el.style.setProperty('--light-x', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--light-y', `${(py * 100).toFixed(1)}%`);
    el.style.setProperty('--light-o', '1');
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
    el.style.setProperty('--light-o', '0');
  };
  return (
    <div className={cn('[perspective:900px]', className)}>
      <div
        ref={ref}
        onPointerMove={move}
        onPointerLeave={leave}
        className="relative h-full transition-transform duration-500 ease-out [transform-style:preserve-3d] motion-reduce:transition-none"
        style={{ transform: 'rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))' }}
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: 'var(--light-o, 0)',
            background: 'radial-gradient(18rem circle at var(--light-x, 50%) var(--light-y, 50%), hsl(var(--whink-accent) / 0.18), transparent 60%)',
          }}
        />
      </div>
    </div>
  );
}

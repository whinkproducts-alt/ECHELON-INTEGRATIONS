'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { HOLO_STATE_LABELS, countByState, stateIndex, type HoloAgent } from './holo-types';
import type { HoloController, HoloStats } from './holo-three-core-rendering';

interface HoloOrbFieldProps {
  agents: readonly HoloAgent[];
  onStats?: (s: HoloStats) => void;
  onError?: (reason: 'context_lost' | 'webgl_unavailable') => void;
  className?: string;
}

/**
 * Canvas host for the instanced orb field. three.js is loaded on demand inside the effect,
 * so nothing browser only runs during SSR. All state changes happen in callbacks.
 */
export function HoloOrbField({ agents, onStats, onError, className }: HoloOrbFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<HoloController | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; agent: HoloAgent } | null>(null);

  const states = useMemo(() => {
    const out = new Uint8Array(agents.length);
    agents.forEach((a, i) => { out[i] = stateIndex(a.state); });
    return out;
  }, [agents]);

  const statesRef = useRef(states);
  const countRef = useRef(agents.length);
  const cbRef = useRef({ onStats, onError });
  useEffect(() => { cbRef.current = { onStats, onError }; }, [onStats, onError]);

  // Mount: create the controller once per agent count.
  const count = agents.length;
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || count === 0) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    import('./holo-three-core-rendering')
      .then(({ createHoloField }) => {
        if (cancelled) return;
        const ctrl = createHoloField({
          canvas,
          agentCount: count,
          states: statesRef.current,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          onStats: (s) => cbRef.current.onStats?.(s),
          onError: (r) => cbRef.current.onError?.(r),
        });
        if (!ctrl) return;
        ctrlRef.current = ctrl;
        countRef.current = count;
        const fit = () => ctrl.resize(wrap.clientWidth, wrap.clientHeight);
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(wrap);
      })
      .catch(() => cbRef.current.onError?.('webgl_unavailable'));
    return () => {
      cancelled = true;
      ro?.disconnect();
      ctrlRef.current?.dispose();
      ctrlRef.current = null;
    };
  }, [count]);

  // State updates flow to the GPU without recreating anything.
  useEffect(() => {
    statesRef.current = states;
    ctrlRef.current?.setStates(states);
  }, [states]);

  const counts = countByState(agents);
  const summary = (Object.keys(counts) as Array<keyof typeof counts>)
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${HOLO_STATE_LABELS[k].toLowerCase()}`)
    .join(', ');

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`Agent orb field. ${agents.length} agents: ${summary}. Arrow keys rotate, plus and minus zoom.`}
        className="block h-full w-full touch-none cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        onPointerMove={(e) => {
          const i = ctrlRef.current?.pick(e.clientX, e.clientY) ?? -1;
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(i >= 0 && agents[i] ? { x: e.clientX - rect.left, y: e.clientY - rect.top, agent: agents[i] } : null);
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          const c = ctrlRef.current;
          if (!c) return;
          const step = 0.12;
          if (e.key === 'ArrowLeft') c.nudge(-step, 0);
          else if (e.key === 'ArrowRight') c.nudge(step, 0);
          else if (e.key === 'ArrowUp') c.nudge(0, -step);
          else if (e.key === 'ArrowDown') c.nudge(0, step);
          else if (e.key === '+' || e.key === '=') c.zoom(-0.3);
          else if (e.key === '-') c.zoom(0.3);
          else return;
          e.preventDefault();
        }}
      />
      {hover && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md"
          style={{ left: hover.x + 12, top: hover.y + 12, boxShadow: 'var(--shadow-md)' }}
        >
          <span className="font-medium text-foreground">{hover.agent.name}</span>
          <span className="ml-2 font-mono text-muted-foreground">{HOLO_STATE_LABELS[hover.agent.state]}</span>
        </div>
      )}
    </div>
  );
}

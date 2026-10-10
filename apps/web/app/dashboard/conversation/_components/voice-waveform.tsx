'use client';

import { useEffect, useRef } from 'react';

interface VoiceWaveformProps {
  /** 0–1 amplitude from AnalyserNode; drives bar heights */
  amplitude: number;
  /** Number of bars to render */
  bars?: number;
  /** accent colour variable name without hsl() wrapper */
  colorVar?: string;
  /** Whether to actually render (skip when not speaking) */
  active: boolean;
}

const BAR_COUNT = 16;

/**
 * CSS-only animated waveform bar strip.
 * Each bar's height is derived from amplitude with per-bar phase offset to
 * create a wave-like appearance — no canvas, no external libs.
 *
 * When `active` is false the component returns null and renders nothing.
 */
export function VoiceWaveform({
  amplitude,
  bars = BAR_COUNT,
  colorVar = 'var(--whink-accent)',
  active,
}: VoiceWaveformProps) {
  const frameRef = useRef<number>(0);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const ampRef = useRef(amplitude);
  const phaseRef = useRef(0);

  // Keep latest amplitude accessible inside rAF without re-registering
  useEffect(() => {
    ampRef.current = amplitude;
  }, [amplitude]);

  useEffect(() => {
    if (!active) return;

    const animate = () => {
      phaseRef.current += 0.12; // ~7 Hz wave at 60 fps
      const phase = phaseRef.current;
      const amp = ampRef.current;

      barsRef.current.forEach((el, i) => {
        if (!el) return;
        // Per-bar sine offset creates travelling wave; multiply by amplitude
        const normalised = i / (bars - 1); // 0–1 across bar array
        const wave = 0.15 + 0.85 * Math.abs(Math.sin(phase + normalised * Math.PI * 2.4));
        const h = 4 + wave * amp * 24; // 4px baseline → 28px peak
        el.style.height = `${h}px`;
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [active, bars]);

  if (!active) return null;

  // Inline color resolution — we need the raw HSL var to pass to inline style
  const color = colorVar.startsWith('hsl(') ? colorVar : `hsl(${colorVar})`;

  return (
    <div
      className="flex items-center justify-center gap-px"
      style={{ height: 32, width: bars * 6 }}
      aria-hidden="true"
      aria-label="Voice waveform"
    >
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          style={{
            width: 3,
            borderRadius: 2,
            background: color,
            opacity: 0.7 + 0.3 * (i % 2),
            minHeight: 4,
            height: 4,
            transition: 'height 30ms linear',
            willChange: 'height',
          }}
        />
      ))}
    </div>
  );
}

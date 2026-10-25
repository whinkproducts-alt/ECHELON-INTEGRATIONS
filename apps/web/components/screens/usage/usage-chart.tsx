'use client';
// Hand-built SVG stacked bar chart: input and output tokens per day.
// Accessibility: the SVG has a text summary, the series are named in a legend (not colour only),
// and the same numbers are available as a real table. Colours are design tokens, so it works
// in light and dark. Per-day-per-model data is not in the API, so the model split is shown
// separately by the screen.
import * as React from 'react';
import { fmtCompact, fmtDay, fmtInt } from './format';

export interface DayPoint { day: string; tokensIn: number; tokensOut: number }

const W = 640;
const H = 240;
const PAD = { l: 44, r: 8, t: 12, b: 28 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function UsageChart({ daily }: { daily: DayPoint[] }) {
  const uid = React.useId();
  const total = daily.reduce((a, d) => a + d.tokensIn + d.tokensOut, 0);
  const peak = daily.reduce((a, d) => (d.tokensIn + d.tokensOut > a.v ? { v: d.tokensIn + d.tokensOut, day: d.day } : a), { v: 0, day: '' });
  const top = niceMax(peak.v);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const slot = innerW / Math.max(1, daily.length);
  const bw = Math.max(2, slot * 0.64);
  const y = (v: number) => PAD.t + innerH - (v / top) * innerH;
  const every = daily.length > 14 ? 5 : 1;
  const ticks = [0, 0.5, 1].map((f) => f * top);

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t ${uid}-d`} className="h-auto w-full">
        <title id={`${uid}-t`}>Daily token usage</title>
        <desc id={`${uid}-d`}>{`${fmtInt(total)} tokens over ${daily.length} days. Peak day ${peak.day || 'none'} with ${fmtInt(peak.v)} tokens. Full data is in the table below.`}</desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="hsl(var(--foreground) / 0.12)" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" className="font-mono" fill="hsl(var(--muted-foreground))">{fmtCompact(t)}</text>
          </g>
        ))}
        {daily.map((d, i) => {
          const x = PAD.l + i * slot + (slot - bw) / 2;
          const hOut = (d.tokensOut / top) * innerH;
          const hIn = (d.tokensIn / top) * innerH;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${fmtInt(d.tokensIn)} in, ${fmtInt(d.tokensOut)} out`}</title>
              {d.tokensIn > 0 && <rect x={x} y={PAD.t + innerH - hIn} width={bw} height={hIn} rx="1.5" fill="hsl(var(--whink-accent))" />}
              {d.tokensOut > 0 && <rect x={x} y={PAD.t + innerH - hIn - hOut} width={bw} height={hOut} rx="1.5" fill="hsl(var(--foreground) / 0.5)" />}
              {i % every === 0 && <text x={x + bw / 2} y={H - 9} textAnchor="middle" fontSize="10" className="font-mono" fill="hsl(var(--muted-foreground))">{fmtDay(d.day)}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'hsl(var(--whink-accent))' }} />Input tokens</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'hsl(var(--foreground) / 0.5)' }} />Output tokens</span>
        <span>Dates are UTC</span>
      </figcaption>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-muted-foreground">View as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left font-mono text-xs">
            <caption className="sr-only">Tokens per day</caption>
            <thead><tr className="text-muted-foreground"><th scope="col" className="py-1 pr-4">Day</th><th scope="col" className="pr-4 text-right">Input</th><th scope="col" className="text-right">Output</th></tr></thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day}><th scope="row" className="py-0.5 pr-4 font-normal">{d.day}</th><td className="pr-4 text-right tabular-nums">{fmtInt(d.tokensIn)}</td><td className="text-right tabular-nums">{fmtInt(d.tokensOut)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

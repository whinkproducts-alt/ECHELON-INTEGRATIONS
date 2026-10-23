'use client';

import { FPS_VERDICT_LABELS, FRAME_BUDGET_MS, type FpsVerdict } from './holo-fps';
import type { HoloStats } from './holo-three-core-rendering';

/**
 * Live render telemetry, drawn from real numbers. The verdict is text first.
 * Amber is reserved for pending approvals, so a miss uses the denial token plus a text label.
 */
export function FpsMonitor({ stats }: { stats: HoloStats | null }) {
  if (!stats) {
    return (
      <div role="status" aria-busy="true" className="font-mono text-xs text-muted-foreground">
        Measuring frame rate…
      </div>
    );
  }
  const tone: Record<FpsVerdict, string> = {
    measuring: 'text-muted-foreground',
    sustained: 'text-foreground',
    below_target: 'text-[hsl(var(--denial))]',
  };
  return (
    <dl
      aria-label="Render performance"
      data-testid="fps-monitor"
      data-fps={stats.fps.toFixed(1)}
      data-p95={stats.p95Ms.toFixed(2)}
      data-draw-calls={stats.drawCalls}
      data-visible={stats.visible}
      data-verdict={stats.verdict}
      className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs tabular-nums sm:grid-cols-4"
    >
      <div><dt className="text-muted-foreground">Frame rate</dt><dd className={tone[stats.verdict]}>{stats.fps.toFixed(0)} FPS</dd></div>
      <div><dt className="text-muted-foreground">Frame p95</dt><dd>{stats.p95Ms.toFixed(1)} ms of {FRAME_BUDGET_MS.toFixed(1)}</dd></div>
      <div><dt className="text-muted-foreground">Draw calls</dt><dd>{stats.drawCalls}</dd></div>
      <div><dt className="text-muted-foreground">Visible</dt><dd>{stats.visible} of {stats.total}</dd></div>
      <div className="col-span-2 sm:col-span-4" role="status">
        <dt className="sr-only">Verdict</dt>
        <dd className={tone[stats.verdict]}>{FPS_VERDICT_LABELS[stats.verdict]}</dd>
      </div>
      <div className="col-span-2 sm:col-span-4 text-muted-foreground">
        Detail: {stats.lod[0]} full, {stats.lod[1]} medium, {stats.lod[2]} far
      </div>
    </dl>
  );
}

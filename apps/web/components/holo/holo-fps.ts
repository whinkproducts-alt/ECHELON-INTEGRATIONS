// Rolling frame time statistics. Pure, so the 60 FPS claim can be tested against real numbers.

export interface FpsSnapshot {
  fps: number;
  avgMs: number;
  p95Ms: number;
  worstMs: number;
  samples: number;
}

export const TARGET_FPS = 60;
/** 1000/60 = 16.67 ms. A small tolerance absorbs timer jitter. */
export const FRAME_BUDGET_MS = 1000 / TARGET_FPS;

export class FpsMeter {
  private readonly buf: Float32Array;
  private head = 0;
  private filled = 0;

  constructor(windowSize = 120) {
    this.buf = new Float32Array(windowSize);
  }

  push(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    this.buf[this.head] = frameMs;
    this.head = (this.head + 1) % this.buf.length;
    this.filled = Math.min(this.filled + 1, this.buf.length);
  }

  snapshot(): FpsSnapshot {
    const n = this.filled;
    if (n === 0) return { fps: 0, avgMs: 0, p95Ms: 0, worstMs: 0, samples: 0 };
    const vals = Array.from(this.buf.subarray(0, n)).sort((a, b) => a - b);
    const sum = vals.reduce((s, v) => s + v, 0);
    const avgMs = sum / n;
    const p95Ms = vals[Math.min(n - 1, Math.floor(n * 0.95))];
    return { fps: 1000 / avgMs, avgMs, p95Ms, worstMs: vals[n - 1], samples: n };
  }
}

export type FpsVerdict = 'measuring' | 'sustained' | 'below_target';

/** Sustained means the 95th percentile frame fits the budget (with 10 percent tolerance). */
export function fpsVerdict(s: FpsSnapshot, minSamples = 60): FpsVerdict {
  if (s.samples < minSamples) return 'measuring';
  return s.p95Ms <= FRAME_BUDGET_MS * 1.1 ? 'sustained' : 'below_target';
}

export const FPS_VERDICT_LABELS: Record<FpsVerdict, string> = {
  measuring: 'Measuring',
  sustained: '60 FPS sustained',
  below_target: 'Below 60 FPS',
};

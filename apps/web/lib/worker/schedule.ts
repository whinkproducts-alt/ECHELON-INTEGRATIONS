/** Interval strings used by config/standing-roster.json: "every <N><m|h|d>". */
const RE = /^every (\d{1,4})([mhd])$/;
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export function parseInterval(s: string): number | null {
  const m = RE.exec(s.trim());
  if (!m) return null;
  const ms = Number(m[1]) * UNIT_MS[m[2] as keyof typeof UNIT_MS];
  return ms >= 60_000 ? ms : null;
}

export function intervalOrThrow(s: string): number {
  const ms = parseInterval(s);
  if (ms === null) throw new Error(`invalid schedule: ${s}`);
  return ms;
}

/** Exponential backoff after consecutive failures: interval * 2^n, capped at 6 h (never below the interval). */
export function backoffMs(intervalMs: number, failures: number): number {
  if (failures <= 0) return intervalMs;
  const cap = Math.max(intervalMs, 6 * 3_600_000);
  return Math.min(intervalMs * 2 ** Math.min(failures, 10), cap);
}

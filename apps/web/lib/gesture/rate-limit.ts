/**
 * Sliding window rate limiter: 100 gestures per 60 s per user.
 * In memory, bounded: at most LIMIT timestamps per user, idle users pruned.
 * Behind a small interface so a shared store can replace it for multi instance deploys.
 */

export const GESTURE_LIMIT = 100;
export const WINDOW_MS = 60_000;

export interface RateLimiter {
  take(userId: string, nowMs?: number): { allowed: boolean; remaining: number; retryAfterMs: number };
}

export class SlidingWindowLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit = GESTURE_LIMIT, private windowMs = WINDOW_MS) {}

  take(userId: string, nowMs: number = Date.now()) {
    const cutoff = nowMs - this.windowMs;
    const arr = (this.hits.get(userId) ?? []).filter((t) => t > cutoff);
    if (arr.length >= this.limit) {
      this.hits.set(userId, arr);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, arr[0] + this.windowMs - nowMs) };
    }
    arr.push(nowMs);
    this.hits.set(userId, arr);
    if (this.hits.size > 5000) this.prune(cutoff);
    return { allowed: true, remaining: this.limit - arr.length, retryAfterMs: 0 };
  }

  private prune(cutoff: number): void {
    for (const [u, arr] of this.hits) if (arr.length === 0 || arr[arr.length - 1] <= cutoff) this.hits.delete(u);
  }
}

const g = globalThis as unknown as { __gestureLimiter?: RateLimiter };
export const gestureLimiter: RateLimiter = (g.__gestureLimiter ??= new SlidingWindowLimiter());

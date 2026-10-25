/**
 * Sliding-window rate limiter. Edge-safe (no Node imports).
 *
 * The in-memory store is per process: good for one Mac Mini, not for several instances.
 * Swap in a Redis-backed RateLimitStore later (same interface) without touching callers.
 * Keys always include a tenant or client part, so buckets never mix users.
 */

export interface RateLimitRule {
  /** Max hits allowed inside the window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimitStore {
  /** Record one hit for key and report whether it fits the rule. A rejected hit is not stored. */
  hit(key: string, rule: RateLimitRule, now: number): Promise<RateLimitResult> | RateLimitResult;
}

const MAX_KEYS = 10_000;

export class InMemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, number[]>();

  hit(key: string, rule: RateLimitRule, now: number): RateLimitResult {
    const cutoff = now - rule.windowMs;
    const live = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (live.length >= rule.limit) {
      this.hits.set(key, live);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, live[0] + rule.windowMs - now) };
    }
    live.push(now);
    this.hits.set(key, live);
    if (this.hits.size > MAX_KEYS) this.prune(now - rule.windowMs);
    return { allowed: true, remaining: rule.limit - live.length, retryAfterMs: 0 };
  }

  private prune(cutoff: number): void {
    for (const [k, v] of this.hits) {
      if (v.length === 0 || v[v.length - 1] <= cutoff) this.hits.delete(k);
    }
  }

  clear(): void {
    this.hits.clear();
  }
}

/** Named rules. Numbers are per user (or per client address for unauthenticated routes). */
export const RATE_RULES = {
  auth: { limit: 10, windowMs: 60_000 },
  signup: { limit: 5, windowMs: 60_000 },
  approvals: { limit: 30, windowMs: 60_000 },
  comms: { limit: 10, windowMs: 60_000 },
  import: { limit: 5, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateBucket = keyof typeof RATE_RULES;

let store: RateLimitStore = new InMemoryRateLimitStore();

export function setRateLimitStore(s: RateLimitStore): void {
  store = s;
}

export async function checkRateLimit(
  bucket: RateBucket,
  subject: string,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  if (!subject) throw new Error('rate-limit: subject is required');
  return store.hit(`${bucket}:${subject}`, RATE_RULES[bucket], now);
}

/** Returns a 429 Response when over the limit, otherwise null. Never includes the subject. */
export async function limitOr429(bucket: RateBucket, subject: string): Promise<Response | null> {
  const r = await checkRateLimit(bucket, subject);
  if (r.allowed) return null;
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(Math.ceil(r.retryAfterMs / 1000)),
    },
  });
}

/** Client address from proxy headers; falls back to a shared bucket so absence never means unlimited. */
export function clientKey(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || headers.get('x-real-ip') || 'unknown-client';
}

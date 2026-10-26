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
  /** Per sign-in account (email), whatever address the attempts come from. */
  auth_account: { limit: 8, windowMs: 60_000 },
  /** Shared per-route bucket used only when no trustworthy client address exists. Looser, so one flood cannot lock the owner out as quickly. */
  auth_route: { limit: 120, windowMs: 60_000 },
  signup: { limit: 5, windowMs: 60_000 },
  signup_route: { limit: 60, windowMs: 60_000 },
  approvals: { limit: 30, windowMs: 60_000 },
  comms: { limit: 10, windowMs: 60_000 },
  import: { limit: 5, windowMs: 60_000 },
  change_requests: { limit: 30, windowMs: 60_000 },
  contracts: { limit: 60, windowMs: 60_000 },
  swarm: { limit: 6, windowMs: 60_000 },
  passkey: { limit: 20, windowMs: 60_000 },
  recommendations: { limit: 60, windowMs: 60_000 },
  /** Read-only history, ledger search and health routes. */
  read: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateBucket = keyof typeof RATE_RULES;

/**
 * RATE_LIMIT_STORE=memory|postgres. Default: postgres when DATABASE_URL is set (memory under
 * test unless asked for explicitly). The Postgres store is loaded lazily so this module stays
 * free of Prisma imports.
 */
export function resolveStoreKind(env: Record<string, string | undefined> = process.env): 'memory' | 'postgres' {
  const v = (env.RATE_LIMIT_STORE ?? '').trim().toLowerCase();
  if (v === 'memory' || v === 'postgres') return v;
  if (env.NODE_ENV === 'test') return 'memory';
  return env.DATABASE_URL ? 'postgres' : 'memory';
}

let store: RateLimitStore | null = null;

class LazyDefaultStore implements RateLimitStore {
  private inner: Promise<RateLimitStore> | null = null;
  async hit(key: string, rule: RateLimitRule, now: number): Promise<RateLimitResult> {
    this.inner ??=
      resolveStoreKind() === 'postgres'
        ? import('./rate-limit-postgres').then((m) => new m.PostgresRateLimitStore())
        : Promise.resolve(new InMemoryRateLimitStore());
    return (await this.inner).hit(key, rule, now);
  }
}

export function setRateLimitStore(s: RateLimitStore): void {
  store = s;
}

export async function checkRateLimit(
  bucket: RateBucket,
  subject: string,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  if (!subject) throw new Error('rate-limit: subject is required');
  store ??= new LazyDefaultStore();
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

/**
 * Client key for unauthenticated routes. X-Forwarded-For is attacker-controlled unless a
 * trusted reverse proxy appends to it, so it is used ONLY when TRUSTED_PROXY_HOPS (a positive
 * integer: how many trusted proxies sit in front of us) is set, and then the Nth address from
 * the right is taken (the one the nearest trusted proxy saw). Otherwise there is no
 * trustworthy address in a Next proxy file, so the caller gets null and must use the looser
 * per-route bucket plus the per-account bucket. Never one global shared key for all routes.
 */
export function clientKey(headers: Headers, hops: number = trustedHops()): string | null {
  if (!hops) return null;
  const parts = (headers.get('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < hops) return null;
  const addr = parts[parts.length - hops];
  return /^[0-9a-fA-F:.]{2,45}$/.test(addr) ? addr : null;
}

export function trustedHops(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(env.TRUSTED_PROXY_HOPS ?? '', 10);
  return Number.isInteger(n) && n > 0 && n <= 5 ? n : 0;
}

/**
 * Limit a credentials-style route: per client address when trustworthy, else the shared
 * per-route bucket; plus a per-account bucket when an account name is known.
 */
export async function limitAuthRequest(
  route: 'auth' | 'signup',
  headers: Headers,
  account?: string | null,
): Promise<Response | null> {
  const addr = clientKey(headers);
  const first = addr
    ? await limitOr429(route, addr)
    : await limitOr429(route === 'auth' ? 'auth_route' : 'signup_route', route);
  if (first) return first;
  if (route === 'auth' && account) return limitOr429('auth_account', account.trim().toLowerCase().substring(0, 254));
  return null;
}

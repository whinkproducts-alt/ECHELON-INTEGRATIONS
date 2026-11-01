import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  InMemoryRateLimitStore,
  type RateLimitResult,
  type RateLimitRule,
  type RateLimitStore,
} from '@/lib/rate-limit';

/** Counter rows older than this are garbage (the longest rule window is far shorter). */
const RETENTION_MS = 10 * 60_000;
const CLEANUP_EVERY_MS = 60_000;
const WARN_EVERY_MS = 60_000;

/**
 * Fixed-window limiter backed by Postgres, shared across workers and restarts.
 * One atomic INSERT ... ON CONFLICT DO UPDATE increments the window counter, so concurrent
 * hits never lose updates. Every hit counts, including rejected ones. If the database is
 * unreachable the hit is enforced by a per-process in-memory store instead (never allowed
 * unchecked), with one warning per minute.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  private lastCleanup = Number.NEGATIVE_INFINITY;
  private lastWarn = Number.NEGATIVE_INFINITY;

  constructor(private readonly fallback: RateLimitStore = new InMemoryRateLimitStore()) {}

  async hit(key: string, rule: RateLimitRule, now: number): Promise<RateLimitResult> {
    const windowStartMs = Math.floor(now / rule.windowMs) * rule.windowMs;
    try {
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO "rate_limit_buckets" ("key", "windowStart", "count")
        VALUES (${key}, ${new Date(windowStartMs)}, 1)
        ON CONFLICT ("key", "windowStart")
        DO UPDATE SET "count" = "rate_limit_buckets"."count" + 1
        RETURNING "count"`;
      const count = Number(rows[0]?.count);
      if (!Number.isFinite(count)) throw new Error('rate_limit_buckets returned no count');
      this.maybeCleanup(now);
      if (count <= rule.limit) return { allowed: true, remaining: rule.limit - count, retryAfterMs: 0 };
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, windowStartMs + rule.windowMs - now) };
    } catch {
      this.warnOnce(now);
      return this.fallback.hit(key, rule, now);
    }
  }

  private warnOnce(now: number): void {
    if (now - this.lastWarn < WARN_EVERY_MS) return;
    this.lastWarn = now;
    logger.warn('rate-limit: database unreachable, using in-memory fallback (per process)');
  }

  /** Opportunistic, at most once a minute per process, never awaited by the request. */
  private maybeCleanup(now: number): void {
    if (now - this.lastCleanup < CLEANUP_EVERY_MS) return;
    this.lastCleanup = now;
    void prisma
      .$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "windowStart" < ${new Date(now - RETENTION_MS)}`
      .catch(() => {});
  }
}

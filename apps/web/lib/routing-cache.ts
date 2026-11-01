// In-memory cache of routing decisions. Bounded LRU with TTL.
// Keys include accountId and the load epoch, so one tenant never reads another's
// decision and a load change makes older entries unreachable.
export interface RoutingCacheOptions { maxEntries?: number; ttlMs?: number; now?: () => number }

export class RoutingCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  private readonly max: number;
  private readonly ttl: number;
  private readonly now: () => number;
  hits = 0;
  misses = 0;

  constructor(opts: RoutingCacheOptions = {}) {
    this.max = opts.maxEntries ?? 1000;
    this.ttl = opts.ttlMs ?? 5000;
    this.now = opts.now ?? Date.now;
  }

  static key(accountId: string, epoch: number, skills: string[], filters: Record<string, unknown> = {}): string {
    if (!accountId) throw new Error('routing-cache: accountId required');
    const f = Object.keys(filters).sort().map((k) => `${k}=${String(filters[k] ?? '')}`).join('&');
    return [accountId, epoch, [...new Set(skills)].sort().join(','), f].join('|');
  }

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) { this.misses++; return undefined; }
    if (e.expires <= this.now()) { this.map.delete(key); this.misses++; return undefined; }
    this.map.delete(key); this.map.set(key, e); // refresh LRU order
    this.hits++;
    return e.value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: this.now() + this.ttl });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  /** Drop every entry for one account (for example after a registry reload). */
  invalidateAccount(accountId: string): void {
    for (const k of this.map.keys()) if (k.startsWith(`${accountId}|`)) this.map.delete(k);
  }
  clear(): void { this.map.clear(); }
  get size(): number { return this.map.size; }
}

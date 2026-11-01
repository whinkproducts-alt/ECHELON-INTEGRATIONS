// In-memory load and outcome tracking per account. Every key is scoped by accountId
// so two tenants never see each other's load or success history.
// This is process-local. Persist outcomes via the ledger before relying on it across restarts.
export interface AgentStatsProvider {
  /** 0..1, where 0 means no free capacity. */
  availability(accountId: string, agentId: string, state: string): number;
  /** 0..1, smoothed. */
  successRate(accountId: string, agentId: string): number;
}

export interface BalancerOptions {
  maxConcurrent?: number;
  /** Laplace prior. A new agent scores (1)/(2)=0.5 until it has history. */
  priorSuccesses?: number;
  priorTotal?: number;
}

interface Tally { inFlight: number; ok: number; fail: number }

const UNROUTABLE = new Set(['suspended', 'retired']);

export class LoadBalancer implements AgentStatsProvider {
  private tallies = new Map<string, Tally>();
  private version = 0;
  private readonly maxConcurrent: number;
  private readonly priorS: number;
  private readonly priorT: number;

  constructor(opts: BalancerOptions = {}) {
    this.maxConcurrent = opts.maxConcurrent ?? 3;
    this.priorS = opts.priorSuccesses ?? 1;
    this.priorT = opts.priorTotal ?? 2;
  }

  private key(accountId: string, agentId: string): string {
    if (!accountId) throw new Error('load-balancer: accountId required');
    return `${accountId}\u0000${agentId}`;
  }
  private tally(accountId: string, agentId: string): Tally {
    const k = this.key(accountId, agentId);
    let t = this.tallies.get(k);
    if (!t) { t = { inFlight: 0, ok: 0, fail: 0 }; this.tallies.set(k, t); }
    return t;
  }

  /** Bumps whenever load changes. The routing cache keys on it. */
  get epoch(): number { return this.version; }

  availability(accountId: string, agentId: string, state: string): number {
    if (UNROUTABLE.has(state)) return 0;
    const t = this.tallies.get(this.key(accountId, agentId));
    const used = t?.inFlight ?? 0;
    return Math.max(0, 1 - used / this.maxConcurrent);
  }

  successRate(accountId: string, agentId: string): number {
    const t = this.tallies.get(this.key(accountId, agentId));
    const ok = t?.ok ?? 0;
    const total = ok + (t?.fail ?? 0);
    return (ok + this.priorS) / (total + this.priorT);
  }

  /** Reserve a slot. Returns false when the agent is at capacity. */
  acquire(accountId: string, agentId: string): boolean {
    const t = this.tally(accountId, agentId);
    if (t.inFlight >= this.maxConcurrent) return false;
    t.inFlight++; this.version++;
    return true;
  }

  release(accountId: string, agentId: string, outcome?: 'success' | 'failure'): void {
    const t = this.tally(accountId, agentId);
    if (t.inFlight > 0) t.inFlight--;
    if (outcome === 'success') t.ok++;
    if (outcome === 'failure') t.fail++;
    this.version++;
  }

  inFlight(accountId: string, agentId: string): number {
    return this.tallies.get(this.key(accountId, agentId))?.inFlight ?? 0;
  }

  /**
   * Spread tasks: walk ranked candidates and reserve the first with free capacity.
   * Ties within `tieBand` of the best score go to the least loaded agent.
   */
  assign<T extends { agentId: string; score: number }>(
    accountId: string, ranked: T[], tieBand = 0.02,
  ): T | null {
    if (ranked.length === 0) return null;
    const best = ranked[0].score;
    const band = ranked.filter((c) => best - c.score <= tieBand)
      .sort((a, b) => this.inFlight(accountId, a.agentId) - this.inFlight(accountId, b.agentId));
    for (const c of [...band, ...ranked.filter((c) => !band.includes(c))]) {
      if (this.acquire(accountId, c.agentId)) return c;
    }
    return null;
  }
}

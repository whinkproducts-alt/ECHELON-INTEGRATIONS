/**
 * Estimate shown before Start.
 *   tasks            = one model call per agent task (N)
 *   expectedCalls    = N + ceil(N * retryRate)                 (+1 planner call, already spent at plan time)
 *   maxCalls         = N * (1 + maxRetries)
 *   tokens           = ceil( sum over tasks(tokensIn[role] + tokensOut[role] * min(estimatedCalls,3 for workers)) * (1 + retryRate) )
 *   etaSeconds       = max( ceil(expectedCalls / concurrency), criticalPathTasks ) * avgCallSeconds
 */
import { swarmConfig } from './config';
import type { TaskSpec } from './types';

export interface SwarmEstimate {
  agents: number;
  workPackages: number;
  roles: Record<string, number>;
  expectedCalls: number;
  maxCalls: number;
  tokens: number;
  tokensIn: number;
  tokensOut: number;
  criticalPath: number;
  concurrency: number;
  etaSeconds: number;
  plannerTokens: number;
}

export function criticalPathLength(specs: TaskSpec[]): number {
  const depth = new Map<string, number>();
  const byLane = new Map(specs.map((s) => [s.lane, s]));
  const visit = (lane: string, seen: Set<string>): number => {
    const known = depth.get(lane);
    if (known !== undefined) return known;
    if (seen.has(lane)) return 1;
    seen.add(lane);
    const s = byLane.get(lane);
    const d = 1 + Math.max(0, ...(s?.dependsOn ?? []).map((l) => visit(l, seen)));
    seen.delete(lane);
    depth.set(lane, d);
    return d;
  };
  return Math.max(0, ...specs.map((s) => visit(s.lane, new Set())));
}

export function estimateRun(specs: TaskSpec[], plannerTokens = 0, concurrency = swarmConfig().concurrency): SwarmEstimate {
  const cfg = swarmConfig();
  const e = cfg.estimate;
  const roles: Record<string, number> = { lead: 0, integrator: 0, redteam: 0, reviewer: 0, worker: 0 };
  let tin = 0;
  let tout = 0;
  for (const s of specs) {
    roles[s.role] += 1;
    tin += e.tokensIn[s.role];
    tout += e.tokensOut[s.role] * (s.role === 'worker' ? Math.min(Math.max(s.estimatedCalls, 1), 3) : 1);
  }
  const retry = 1 + e.retryRate;
  const n = specs.length;
  const expectedCalls = n + Math.ceil(n * e.retryRate);
  const criticalPath = criticalPathLength(specs);
  return {
    agents: n,
    workPackages: roles.worker,
    roles,
    expectedCalls,
    maxCalls: n * (1 + cfg.maxRetries),
    tokensIn: Math.ceil(tin * retry),
    tokensOut: Math.ceil(tout * retry),
    tokens: Math.ceil((tin + tout) * retry),
    criticalPath,
    concurrency,
    etaSeconds: Math.ceil(Math.max(Math.ceil(expectedCalls / concurrency), criticalPath) * e.avgCallSeconds),
    plannerTokens,
  };
}

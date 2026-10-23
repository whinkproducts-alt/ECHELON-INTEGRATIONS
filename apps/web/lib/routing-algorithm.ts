// Routing: score = 0.40 skill match + 0.30 availability + 0.30 success rate.
// Routing only proposes candidates. It never activates an agent or runs a tool.
// Activation still needs human approval and the permission engine.
import type { OrgAgent } from './agent-loader';
import type { SkillRegistry } from './skill-registry';
import type { AgentStatsProvider } from './load-balancer';
import { RoutingCache } from './routing-cache';

export const WEIGHTS = { skill: 0.4, availability: 0.3, success: 0.3 } as const;

export interface RouteRequest {
  accountId: string;
  requiredSkills: string[];
  directorate?: string;
  department?: string;
  limit?: number;
}
export interface Candidate {
  agentId: string; name: string; directorate: string; department: string;
  score: number; skillMatch: number; availability: number; successRate: number;
  matchedSkills: string[];
}
export interface RoutingDecision {
  candidates: Candidate[];
  gaps: string[];            // required skills no routable agent holds
  unknownSkills: string[];   // required skills not in the registry
  cached: boolean;
  elapsedMs: number;
}

export function scoreComponents(skillMatch: number, availability: number, successRate: number): number {
  const s = WEIGHTS.skill * skillMatch + WEIGHTS.availability * availability + WEIGHTS.success * successRate;
  return Math.round(s * 10000) / 10000;
}

export class Router {
  private cache: RoutingCache<Omit<RoutingDecision, 'cached' | 'elapsedMs'>>;
  /**
   * `routable` is required and has no default. Build it with makeRoutable(kit) from
   * agent-validator so agents with registry errors can never be proposed.
   */
  constructor(
    private registry: SkillRegistry,
    private stats: AgentStatsProvider,
    private routable: (a: OrgAgent) => boolean,
    private epoch: () => number = () => 0,
    cache?: RoutingCache<Omit<RoutingDecision, 'cached' | 'elapsedMs'>>,
  ) {
    if (typeof routable !== 'function') {
      throw new Error('Router: a validated routable predicate is required (use makeRoutable from agent-validator)');
    }
    this.cache = cache ?? new RoutingCache();
  }

  route(req: RouteRequest): RoutingDecision {
    const t0 = performance.now();
    const required = [...new Set(req.requiredSkills.filter((s) => typeof s === 'string' && s))];
    const limit = Math.max(1, Math.min(req.limit ?? 5, 25));
    const key = RoutingCache.key(req.accountId, this.epoch(), required,
      { d: req.directorate, p: req.department, l: limit });
    const hit = this.cache.get(key);
    if (hit) return { ...hit, cached: true, elapsedMs: performance.now() - t0 };

    const unknownSkills = required.filter((s) => !this.registry.hasSkill(s));
    const known = required.filter((s) => this.registry.hasSkill(s));
    const matched = new Map<string, string[]>();
    for (const sid of known) {
      for (const aid of this.registry.agentIdsFor(sid)) {
        let m = matched.get(aid); if (!m) matched.set(aid, (m = []));
        m.push(sid);
      }
    }
    const candidates: Candidate[] = [];
    const covered = new Set<string>();
    for (const [aid, skills] of matched) {
      const a = this.registry.getAgent(aid);
      if (!a || !this.routable(a)) continue;
      if (req.directorate && a.directorate !== req.directorate) continue;
      if (req.department && a.department !== req.department) continue;
      const availability = this.stats.availability(req.accountId, aid, a.state);
      if (availability <= 0) continue;
      skills.forEach((s) => covered.add(s));
      const skillMatch = skills.length / Math.max(1, required.length);
      const successRate = this.stats.successRate(req.accountId, aid);
      candidates.push({ agentId: aid, name: a.name, directorate: a.directorate, department: a.department,
        score: scoreComponents(skillMatch, availability, successRate),
        skillMatch, availability, successRate, matchedSkills: skills });
    }
    candidates.sort((x, y) => y.score - x.score || x.agentId.localeCompare(y.agentId));
    const value = {
      candidates: candidates.slice(0, limit),
      gaps: known.filter((s) => !covered.has(s)),
      unknownSkills,
    };
    this.cache.set(key, value);
    return { ...value, cached: false, elapsedMs: performance.now() - t0 };
  }
}

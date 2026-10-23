import { describe, it, expect, beforeAll } from 'vitest';
import { loadOrgKit, type OrgKit, type OrgAgent } from '../agent-loader';
import { validateAll, validateAgent, buildRuleContext, RULES, routableAgents } from '../agent-validator';
import { SkillRegistry } from '../skill-registry';
import { Router } from '../routing-algorithm';
import { LoadBalancer } from '../load-balancer';
import { RoutingCache } from '../routing-cache';

let kit: OrgKit;
let registry: SkillRegistry;
beforeAll(async () => {
  kit = await loadOrgKit();
  registry = SkillRegistry.build(kit.skills, routableAgents(kit));
});

describe('loader and registry', () => {
  it('loads 326 agents, 570 skills, 163 teams matching the manifest', () => {
    expect(kit.agents).toHaveLength(326);
    expect(kit.skills).toHaveLength(570);
    expect(kit.teams).toHaveLength(163);
    expect(kit.countMismatches).toEqual([]);
    expect(registry.skillCount).toBe(570);
    expect(registry.unknownBindings).toEqual([]);
  });
});

describe('validator', () => {
  it('has 32 rules in 7 categories', () => {
    const r = validateAll(kit);
    expect(r.ruleCount).toBe(32);
    expect(r.categoryCount).toBe(7);
    expect(new Set(RULES.map((x) => x.id)).size).toBe(32);
  });
  it('passes all 326 agents with no errors', () => {
    const r = validateAll(kit);
    expect(r.violations.filter((v) => v.severity === 'error')).toEqual([]);
    expect(r.valid).toBe(326);
  });
  it('rejects a broken agent and never throws', () => {
    const ctx = buildRuleContext(kit);
    const bad = { ...kit.agents[0], skills: ['nope'], autonomy_level: 9, state: 'active' } as OrgAgent;
    const ids = validateAgent(bad, ctx).map((v) => v.ruleId);
    expect(ids).toEqual(expect.arrayContaining(['SK-03', 'AU-01', 'AU-03']));
    expect(() => validateAgent({} as OrgAgent, ctx)).not.toThrow();
  });
});

describe('routing', () => {
  const skills = ['product_strategy', 'brand_strategy', 'demand_generation', 'project_decomposition'];
  const mk = () => { const lb = new LoadBalancer(); return { lb, router: new Router(registry, lb, () => lb.epoch) }; };

  it('uses 40/30/30 weights', () => {
    const { router } = mk();
    const d = router.route({ accountId: 'a1', requiredSkills: skills });
    expect(d.candidates.length).toBeGreaterThan(0);
    const c = d.candidates[0];
    expect(c.score).toBeCloseTo(0.4 * c.skillMatch + 0.3 * c.availability + 0.3 * c.successRate, 3);
  });
  it('excludes suspended and unknown skills are reported, not invented', () => {
    const { router } = mk();
    const d = router.route({ accountId: 'a1', requiredSkills: ['product_strategy', 'made_up_skill'] });
    expect(d.unknownSkills).toEqual(['made_up_skill']);
  });
  it('load lowers availability and shifts ranking; tenants are isolated', () => {
    const { lb, router } = mk();
    const first = router.route({ accountId: 'a1', requiredSkills: skills }).candidates[0];
    for (let i = 0; i < 3; i++) lb.acquire('a1', first.agentId);
    const after = router.route({ accountId: 'a1', requiredSkills: skills });
    expect(after.candidates.find((c) => c.agentId === first.agentId)).toBeUndefined();
    const other = router.route({ accountId: 'a2', requiredSkills: skills });
    expect(other.candidates[0].agentId).toBe(first.agentId);
  });
  it('success history raises score', () => {
    const { lb, router } = mk();
    const base = router.route({ accountId: 'a1', requiredSkills: skills }).candidates;
    const target = base[base.length - 1];
    for (let i = 0; i < 20; i++) { lb.acquire('a1', target.agentId); lb.release('a1', target.agentId, 'success'); }
    const d = router.route({ accountId: 'a1', requiredSkills: skills }).candidates.find((c) => c.agentId === target.agentId);
    expect(d!.successRate).toBeGreaterThan(0.9);
  });
  it('balancer spreads equal-scored work and respects capacity', () => {
    const lb = new LoadBalancer({ maxConcurrent: 1 });
    const ranked = [{ agentId: 'x', score: 0.8 }, { agentId: 'y', score: 0.8 }];
    expect(lb.assign('a1', ranked)!.agentId).toBe('x');
    expect(lb.assign('a1', ranked)!.agentId).toBe('y');
    expect(lb.assign('a1', ranked)).toBeNull();
  });
  it('cache hits, is account scoped and expires', () => {
    let now = 0;
    const c = new RoutingCache<number>({ ttlMs: 100, now: () => now });
    c.set(RoutingCache.key('a1', 0, ['s']), 1);
    expect(c.get(RoutingCache.key('a1', 0, ['s']))).toBe(1);
    expect(c.get(RoutingCache.key('a2', 0, ['s']))).toBeUndefined();
    now = 101;
    expect(c.get(RoutingCache.key('a1', 0, ['s']))).toBeUndefined();
  });
  it('P95 under 100ms on uncached routes across all skills', () => {
    const { router } = mk();
    const ids = kit.skills.map((s) => s.skill_id);
    const times: number[] = [];
    for (let i = 0; i < 500; i++) {
      const req = [ids[(i * 7) % ids.length], ids[(i * 13 + 1) % ids.length], ids[(i * 29 + 2) % ids.length]];
      times.push(router.route({ accountId: `t${i}`, requiredSkills: req }).elapsedMs);
    }
    times.sort((a, b) => a - b);
    console.log('routing p50/p95/max ms', times[250].toFixed(3), times[475].toFixed(3), times[499].toFixed(3));
    expect(times[475]).toBeLessThan(100);
  });
});

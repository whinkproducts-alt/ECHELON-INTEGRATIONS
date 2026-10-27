/**
 * Swarm planning. Pure, deterministic post-processing that guarantees no overlap:
 * - every package owns exactly one lane and lanes are unique
 * - surplus packages are merged into an existing one, missing ones are split by facet (never duplicated scope)
 * - review, red-team and integration tasks each cover a disjoint set of lanes
 * Nothing here writes shared state. Agents only ever produce outputs that the engine stores per lane.
 */
import { swarmConfig } from './config';
import { WorkPackageSchema, type WorkPackage, type TaskSpec } from './types';

export interface RoleCounts { lead: number; integrator: number; redteam: number; reviewer: number; worker: number }

/** Default mix for 50: 1 lead, 6 integrators, 3 red-team, 10 reviewers, 30 workers. Scales proportionally. */
export function roleCounts(total: number, mix = swarmConfig().roleMix): RoleCounts {
  const integrator = Math.max(1, Math.round(total * mix.integrators));
  const redteam = Math.max(1, Math.round(total * mix.redteam));
  const reviewer = Math.max(1, Math.round(total * mix.reviewers));
  const worker = total - 1 - integrator - redteam - reviewer;
  if (worker < 1) throw new Error('swarm: agent count too small for the role mix');
  return { lead: 1, integrator, redteam, reviewer, worker };
}

export function slugLane(s: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return slug || 'lane';
}

const RESERVED = /^(review|redteam|integrate)-\d+$|^lead$/;
const FACETS = ['evidence', 'risks', 'options', 'execution', 'metrics', 'stakeholders'] as const;

function mergeInto(target: WorkPackage, src: WorkPackage): void {
  if (target.objective.length < 800) target.objective = `${target.objective} Also: ${src.objective}`.slice(0, 800);
  target.requiredSkills = [...new Set([...target.requiredSkills, ...src.requiredSkills])].slice(0, 10);
  target.estimatedCalls = Math.min(5, target.estimatedCalls + src.estimatedCalls);
}

/**
 * Turn the planner's raw package list into exactly `workers` packages with unique lanes and an acyclic
 * dependency graph (dependencies may only point at earlier packages).
 */
export function normalizePackages(rawPackages: unknown[], workers: number): WorkPackage[] {
  const parsed: WorkPackage[] = [];
  for (const r of rawPackages) {
    const p = WorkPackageSchema.safeParse(r);
    if (p.success) parsed.push(p.data);
  }
  if (parsed.length === 0) throw new Error('swarm: planner returned no usable work packages');

  // 1. Unique lanes. A repeated lane is an overlap: merge it into the first owner.
  const alias = new Map<string, string>(); // model id or raw lane -> final lane
  const byLane = new Map<string, WorkPackage>();
  const order: WorkPackage[] = [];
  for (const p of parsed) {
    let lane = slugLane(p.lane);
    if (RESERVED.test(lane)) lane = `w-${lane}`;
    const existing = byLane.get(lane);
    alias.set(p.id, lane);
    alias.set(p.lane, lane);
    if (existing) { mergeInto(existing, p); continue; }
    const copy: WorkPackage = { ...p, lane, dependsOn: p.dependsOn.slice() };
    byLane.set(lane, copy);
    order.push(copy);
  }

  // 2. Too many packages: merge surplus into existing ones (round robin), never keep overlapping owners.
  let merges = 0;
  while (order.length > workers) {
    const surplus = order.pop() as WorkPackage;
    const target = order[merges % workers];
    merges++;
    for (const [k, v] of alias) if (v === surplus.lane) alias.set(k, target.lane);
    mergeInto(target, surplus);
    byLane.delete(surplus.lane);
  }

  // 3. Too few: split by role/facet. Each split is a new distinct scope (a facet of one base package).
  const bases = order.slice();
  for (let i = 0, guard = 0; order.length < workers; i++) {
    if (++guard > workers * 40) throw new Error('swarm: cannot split packages further');
    const base = bases[i % bases.length];
    const facet = FACETS[Math.floor(i / bases.length) % FACETS.length];
    const cycle = Math.floor(i / (bases.length * FACETS.length));
    const lane = slugLane(`${base.lane}-${facet}${cycle > 0 ? `-${cycle + 1}` : ''}`).slice(0, 60);
    if (byLane.has(lane) || RESERVED.test(lane)) continue;
    const p: WorkPackage = {
      id: `split-${order.length + 1}`,
      title: `${base.title} (${facet})`.slice(0, 120),
      objective: `Cover only the ${facet} angle of: ${base.objective}`.slice(0, 800),
      lane,
      dependsOn: [],
      deliverable: `${facet} findings for ${base.title}`.slice(0, 400),
      requiredSkills: base.requiredSkills.slice(),
      estimatedCalls: 1,
    };
    byLane.set(lane, p);
    order.push(p);
  }

  // 4. Dependencies: map ids to lanes, drop unknown, self and forward references. Acyclic by construction.
  const index = new Map(order.map((p, n) => [p.lane, n]));
  for (const p of order) {
    const me = index.get(p.lane) as number;
    const deps = new Set<string>();
    for (const d of p.dependsOn) {
      const lane = alias.get(d) ?? (index.has(d) ? d : undefined);
      if (!lane || lane === p.lane) continue;
      const at = index.get(lane);
      if (at !== undefined && at < me) deps.add(lane);
    }
    p.dependsOn = [...deps];
  }
  // Re-id deterministically.
  order.forEach((p, n) => { p.id = `p${String(n + 1).padStart(2, '0')}`; });
  return order;
}

/** Split `items` into `k` contiguous, disjoint, balanced groups. k is clamped to items.length. */
export function partition<T>(items: T[], k: number): T[][] {
  const groups = Math.max(1, Math.min(k, items.length));
  const out: T[][] = [];
  let start = 0;
  for (let g = 0; g < groups; g++) {
    const size = Math.floor(items.length / groups) + (g < items.length % groups ? 1 : 0);
    out.push(items.slice(start, start + size));
    start += size;
  }
  return out;
}

/** Build the full task list (all roles) from the worker packages. Lanes are unique across all roles. */
export function buildTaskSpecs(packages: WorkPackage[], counts: RoleCounts): TaskSpec[] {
  const specs: TaskSpec[] = packages.map((p) => ({
    lane: p.lane, role: 'worker' as const, title: p.title, objective: p.objective, deliverable: p.deliverable,
    requiredSkills: p.requiredSkills, covers: [], dependsOn: p.dependsOn, estimatedCalls: p.estimatedCalls,
  }));
  const lanes = packages.map((p) => p.lane);
  const skillsOf = (ls: string[]) => [...new Set(packages.filter((p) => ls.includes(p.lane)).flatMap((p) => p.requiredSkills))].slice(0, 10);

  const reviewers = partition(lanes, counts.reviewer).map((covers, k): TaskSpec => ({
    lane: `review-${k + 1}`, role: 'reviewer', title: `Review ${covers.length} lanes`,
    objective: 'Check each covered lane output for accuracy, gaps and unsupported claims. Return a verdict per lane.',
    deliverable: 'A verdict (approved or not) for every covered lane, with reasons.',
    requiredSkills: skillsOf(covers), covers, dependsOn: covers, estimatedCalls: 1,
  }));
  const redteam = partition(lanes, counts.redteam).map((covers, k): TaskSpec => ({
    lane: `redteam-${k + 1}`, role: 'redteam', title: `Red-team ${covers.length} lanes`,
    objective: 'Play the hardest lawful opposing moves and failure modes against the covered lane outputs. Lawful challenge only.',
    deliverable: 'The strongest objections, failure modes and what would change the plan.',
    requiredSkills: skillsOf(covers), covers, dependsOn: covers, estimatedCalls: 1,
  }));
  const integrators = partition(reviewers, counts.integrator).map((rs, k): TaskSpec => {
    const covers = rs.map((r) => r.lane);
    const covered = new Set(rs.flatMap((r) => r.covers));
    const crit = redteam.filter((c) => c.covers.some((l) => covered.has(l))).map((c) => c.lane);
    return {
      lane: `integrate-${k + 1}`, role: 'integrator', title: `Integrate theme ${k + 1}`,
      objective: 'Merge the reviewed lane outputs and the red-team challenges of this theme into one consistent section.',
      deliverable: 'One consolidated section for the final report.',
      requiredSkills: skillsOf([...covered]), covers, dependsOn: [...covers, ...crit], estimatedCalls: 1,
    };
  });
  const lead: TaskSpec = {
    lane: 'lead', role: 'lead', title: 'Final report',
    objective: 'Combine the integrated sections into the final report with decisions, risks and next steps.',
    deliverable: 'The final report.',
    requiredSkills: [], covers: integrators.map((i) => i.lane), dependsOn: integrators.map((i) => i.lane), estimatedCalls: 1,
  };
  return [...specs, ...reviewers, ...redteam, ...integrators, lead];
}

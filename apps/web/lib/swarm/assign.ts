/**
 * Assign real org-kit agents to task slots. Never invents an agent, never reuses one in a run.
 * Score = skill overlap (ignoring skills nearly every agent holds) + directorate spread, ties broken by agent_id.
 */
import type { OrgAgent } from '@/lib/agent-loader';
import type { TaskSpec, AssignedTask } from './types';

const ORDER: Record<TaskSpec['role'], number> = { worker: 0, reviewer: 1, redteam: 2, integrator: 3, lead: 4 };

/** Skills held by at least half of all agents (web_research, quality_review ...) say nothing about fit. */
export function universalSkills(agents: OrgAgent[]): Set<string> {
  const count = new Map<string, number>();
  for (const a of agents) for (const s of new Set(a.skills ?? [])) count.set(s, (count.get(s) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n >= agents.length / 2).map(([s]) => s));
}

function overlap(want: string[], have: Set<string>, universal: Set<string>): number {
  const w = want.filter((s) => !universal.has(s));
  if (w.length === 0) return 0;
  return w.filter((s) => have.has(s)).length / w.length;
}

export function assignAgents(specs: TaskSpec[], agents: OrgAgent[]): AssignedTask[] {
  const pool = agents
    .filter((a) => a.state !== 'suspended' && a.state !== 'retired')
    .sort((x, y) => (x.agent_id < y.agent_id ? -1 : x.agent_id > y.agent_id ? 1 : 0));
  if (pool.length < specs.length) throw new Error(`swarm: only ${pool.length} usable agents for ${specs.length} tasks`);
  const universal = universalSkills(pool);
  const used = new Set<string>();
  const perDirectorate = new Map<string, number>();
  const result = new Map<string, AssignedTask>();

  // Workers first (most specific), then reviewers, red-team, integrators, lead.
  const ordered = specs.map((s, i) => ({ s, i })).sort((a, b) => ORDER[a.s.role] - ORDER[b.s.role] || a.i - b.i);
  for (const { s } of ordered) {
    let best: { a: OrgAgent; score: number; ov: number } | null = null;
    for (const a of pool) {
      if (used.has(a.agent_id)) continue;
      const ov = overlap(s.requiredSkills, new Set(a.skills ?? []), universal);
      const spread = 1 / (1 + (perDirectorate.get(a.directorate) ?? 0));
      const score = ov * 0.7 + spread * 0.3;
      if (!best || score > best.score + 1e-9) best = { a, score, ov }; // pool is id-sorted: first wins ties
    }
    if (!best) throw new Error('swarm: ran out of agents');
    used.add(best.a.agent_id);
    perDirectorate.set(best.a.directorate, (perDirectorate.get(best.a.directorate) ?? 0) + 1);
    result.set(s.lane, { ...s, agentId: best.a.agent_id, agentName: best.a.name, fit: best.ov > 0 ? 'matched' : 'generalist' });
  }
  return specs.map((s) => result.get(s.lane) as AssignedTask);
}

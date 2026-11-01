// Skill registry: indexes skills and binds them to agents.
import type { OrgAgent, OrgSkill } from './agent-loader';

export class SkillRegistry {
  private skills = new Map<string, OrgSkill>();
  private bySkill = new Map<string, Set<string>>();
  private byAgent = new Map<string, string[]>();
  private agents = new Map<string, OrgAgent>();
  readonly unknownBindings: Array<{ agentId: string; skillId: string }> = [];

  register(skill: OrgSkill): void {
    if (!skill?.skill_id) throw new Error('skill-registry: skill_id required');
    if (this.skills.has(skill.skill_id)) throw new Error(`skill-registry: duplicate skill ${skill.skill_id}`);
    this.skills.set(skill.skill_id, skill);
    this.bySkill.set(skill.skill_id, new Set());
  }

  /** Bind an agent to its skills. Unknown skill ids are recorded, never auto-created. */
  bind(agent: OrgAgent): void {
    this.agents.set(agent.agent_id, agent);
    const bound: string[] = [];
    for (const sid of agent.skills ?? []) {
      const set = this.bySkill.get(sid);
      if (!set) { this.unknownBindings.push({ agentId: agent.agent_id, skillId: sid }); continue; }
      set.add(agent.agent_id);
      bound.push(sid);
    }
    this.byAgent.set(agent.agent_id, bound);
  }

  static build(skills: OrgSkill[], agents: OrgAgent[]): SkillRegistry {
    const r = new SkillRegistry();
    skills.forEach((s) => r.register(s));
    agents.forEach((a) => r.bind(a));
    return r;
  }

  get skillCount(): number { return this.skills.size; }
  get agentCount(): number { return this.agents.size; }
  hasSkill(id: string): boolean { return this.skills.has(id); }
  getSkill(id: string): OrgSkill | undefined { return this.skills.get(id); }
  getAgent(id: string): OrgAgent | undefined { return this.agents.get(id); }
  skillsFor(agentId: string): string[] { return this.byAgent.get(agentId) ?? []; }
  agentIdsFor(skillId: string): string[] { return [...(this.bySkill.get(skillId) ?? [])]; }
  /** Registered skills no agent holds. Capability gaps to report, not to auto-fill. */
  unboundSkills(): string[] {
    return [...this.bySkill.entries()].filter(([, s]) => s.size === 0).map(([id]) => id);
  }
  allAgents(): OrgAgent[] { return [...this.agents.values()]; }
}

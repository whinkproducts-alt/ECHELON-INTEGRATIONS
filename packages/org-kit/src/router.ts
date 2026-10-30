/**
 * WHINK GROUP Org-Kit — TypeScript Router Service
 *
 * Provider-neutral. Reads the workforce and skill registries,
 * scores agents against required skills, and returns an
 * Execution Authorization Request.
 *
 * No AI provider is called here. Execution happens only after
 * Victor (Kaycee) approves the returned request.
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

// ── Types ────────────────────────────────────────────────────────────────────

export interface Agent {
  agent_id: string;
  name: string;
  title: string;
  directorate: string;
  department: string;
  team: string;
  reports_to_human: string;
  mission: string;
  responsibilities: string[];
  skills: string[];
  tools: string[];
  data_access: string[];
  permissions: string[];
  autonomy_level: number;
  state: "dormant" | "consulted" | "active" | "lead" | "reviewer" | "suspended" | "retired";
  human_approval_required_for: string[];
  completion_criteria: string[];
  kpis: string[];
  provider_binding: string | null;
  cost_profile: "low" | "medium" | "high";
}

export interface ExecutionAuthorizationRequest {
  /** Explicitly approved execution boundary; legacy requests are not executable. */
  execution_scope?: 'internal_analysis';
  status: "AWAITING_HUMAN_APPROVAL";
  objective: string;
  owning_directorate: string | null;
  owning_department: string | null;
  lead_agent: string | null;
  supporting_agents: string[];
  team_size: number;
  why_sufficient: string;
  required_skills: string[];
  capability_gaps: string[];
  schedule: string;
  milestones: string[];
  estimated_budget: string;
  assumptions: string[];
  risks: string[];
  approval_required: true;
  execution_allowed: false;
}

export interface RouterOptions {
  targetDirectorate?: string;
  targetDepartment?: string;
  maxAgents?: number;
  schedule?: string;
  budget?: string;
}

// ── Registry loading ──────────────────────────────────────────────────────────

let _agents: Agent[] | null = null;

function loadAgents(): Agent[] {
  if (!_agents) {
    const p = path.join(ROOT, "organization", "workforce_registry.json");
    _agents = JSON.parse(fs.readFileSync(p, "utf-8")) as Agent[];
  }
  return _agents;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const COST_RANK: Record<string, number> = { low: 3, medium: 2, high: 1 };

function scoreAgent(
  agent: Agent,
  requiredSkills: string[],
  targetDirectorate?: string,
  targetDepartment?: string
): number {
  const agentSkills = new Set(agent.skills);
  const required = new Set(requiredSkills);
  const overlap =
    [...required].filter((s) => agentSkills.has(s)).length /
    Math.max(1, required.size);

  let score = overlap * 0.45;
  if (targetDepartment && agent.department === targetDepartment) score += 0.2;
  if (targetDirectorate && agent.directorate === targetDirectorate) score += 0.1;
  if (agent.state === "dormant") score += 0.1;
  score += ((COST_RANK[agent.cost_profile] ?? 1) / 3) * 0.1;
  if (agent.state === "suspended") score -= 0.3;

  return Math.round(score * 10000) / 10000;
}

// ── Team selection ────────────────────────────────────────────────────────────

function proposeTeam(
  requiredSkills: string[],
  opts: RouterOptions = {}
): { selected: Array<{ score: number } & Agent>; gaps: string[] } {
  const agents = loadAgents();
  const { targetDirectorate, targetDepartment, maxAgents = 5 } = opts;

  const scored = agents
    .map((a) => ({
      score: scoreAgent(a, requiredSkills, targetDirectorate, targetDepartment),
      ...a,
    }))
    .sort((a, b) => b.score - a.score);

  const selected: Array<{ score: number } & Agent> = [];
  const covered = new Set<string>();
  const required = new Set(requiredSkills);

  for (const agent of scored) {
    const newCoverage = agent.skills.filter(
      (s) => required.has(s) && !covered.has(s)
    );
    if (newCoverage.length === 0) continue;

    selected.push(agent);
    newCoverage.forEach((s) => covered.add(s));

    if (covered.size >= required.size || selected.length >= maxAgents) break;
  }

  const gaps = [...required].filter((s) => !covered.has(s));
  return { selected, gaps };
}

// ── Authorization Request builder ─────────────────────────────────────────────

export function buildAuthorizationRequest(
  objective: string,
  requiredSkills: string[],
  opts: RouterOptions = {}
): ExecutionAuthorizationRequest {
  const { selected, gaps } = proposeTeam(requiredSkills, opts);

  const lead = selected[0]?.name ?? null;
  const supporting = selected.slice(1).map((a) => a.name);

  const whySufficient =
    selected.length > 0
      ? `Team covers ${requiredSkills.length - gaps.length}/${requiredSkills.length} required skills ` +
        `with ${selected.length} agent(s). Gaps: ${gaps.length === 0 ? "none" : gaps.join(", ")}.`
      : "No suitable agents found. New agent creation requires human approval.";

  return {
    status: "AWAITING_HUMAN_APPROVAL",
    objective,
    owning_directorate: opts.targetDirectorate ?? selected[0]?.directorate ?? null,
    owning_department: opts.targetDepartment ?? selected[0]?.department ?? null,
    lead_agent: lead,
    supporting_agents: supporting,
    team_size: selected.length,
    why_sufficient: whySufficient,
    required_skills: requiredSkills,
    capability_gaps: gaps,
    schedule: opts.schedule ?? "To be confirmed by Founder",
    milestones: [],
    estimated_budget: opts.budget ?? "Requires provider rate card — submit after approval",
    assumptions: [],
    risks: gaps.length > 0 ? [`Capability gap in: ${gaps.join(", ")}`] : [],
    approval_required: true,
    execution_allowed: false,
  };
}

// ── Quick lookups ─────────────────────────────────────────────────────────────

export function findAgentsBySkill(skill: string): Agent[] {
  return loadAgents().filter((a) => a.skills.includes(skill));
}

export function findAgentsByDirectorate(directorate: string): Agent[] {
  return loadAgents().filter((a) => a.directorate === directorate);
}

export function getAgent(agentId: string): Agent | undefined {
  return loadAgents().find((a) => a.agent_id === agentId);
}

// ── CLI smoke test ────────────────────────────────────────────────────────────

if (require.main === module) {
  const request = buildAuthorizationRequest(
    "Prepare a cross-functional product launch plan for WHINK Ultimate v1",
    ["product_strategy", "brand_strategy", "demand_generation", "project_decomposition"],
    { targetDirectorate: "Product" }
  );
  console.log(JSON.stringify(request, null, 2));
}

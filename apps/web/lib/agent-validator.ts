// 32 validation rules across 7 categories for org-kit agents.
// NOTE: the rule list was not found in the repo. These 32 rules are derived from
// packages/org-kit/agents/AGENT_SCHEMA.json and governance/core_governance.yaml.
// Replace or amend once Victor supplies the canonical list.
import type { OrgAgent, OrgKit } from './agent-loader';

export type RuleCategory =
  | 'identity' | 'organization' | 'skills' | 'autonomy' | 'delegation' | 'tools' | 'quality';
export type Severity = 'error' | 'warn';

export interface RuleContext {
  skillIds: Set<string>;
  teamIds: Set<string>;
  idCounts: Map<string, number>;
  toolCapabilities: OrgKit['toolCapabilities'];
  states: Set<string>;
}

export interface Rule {
  id: string;
  category: RuleCategory;
  severity: Severity;
  description: string;
  check: (a: OrgAgent, c: RuleContext) => boolean;
}

const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const arr = (v: unknown): v is unknown[] => Array.isArray(v);
const nonEmpty = (v: unknown) => arr(v) && v.length > 0;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const SNAKE = /^[a-z][a-z0-9_]*$/;
const KNOWN_PERMISSIONS = new Set(['advice', 'draft', 'prepare']);

export const RULES: Rule[] = [
  // identity (5)
  { id: 'ID-01', category: 'identity', severity: 'error', description: 'agent_id present',
    check: (a) => str(a.agent_id) },
  { id: 'ID-02', category: 'identity', severity: 'error', description: 'agent_id has 4 dot segments',
    check: (a) => str(a.agent_id) && a.agent_id.split('.').length === 4 },
  { id: 'ID-03', category: 'identity', severity: 'error', description: 'agent_id unique',
    check: (a, c) => (c.idCounts.get(a.agent_id) ?? 0) === 1 },
  { id: 'ID-04', category: 'identity', severity: 'error', description: 'name present',
    check: (a) => str(a.name) },
  { id: 'ID-05', category: 'identity', severity: 'error', description: 'title present',
    check: (a) => str(a.title) },
  // organization (5)
  { id: 'ORG-01', category: 'organization', severity: 'error', description: 'directorate present',
    check: (a) => str(a.directorate) },
  { id: 'ORG-02', category: 'organization', severity: 'error', description: 'department present',
    check: (a) => str(a.department) },
  { id: 'ORG-03', category: 'organization', severity: 'error', description: 'team present',
    check: (a) => str(a.team) },
  { id: 'ORG-04', category: 'organization', severity: 'error', description: 'team exists in team registry',
    check: (a, c) => str(a.agent_id) && c.teamIds.has(a.agent_id.split('.').slice(0, 3).join('.')) },
  { id: 'ORG-05', category: 'organization', severity: 'warn', description: 'agent_id directorate segment matches directorate',
    check: (a) => str(a.agent_id) && str(a.directorate) && a.agent_id.split('.')[0] === slug(a.directorate) },
  // skills (5)
  { id: 'SK-01', category: 'skills', severity: 'error', description: 'skills[] non-empty',
    check: (a) => nonEmpty(a.skills) },
  { id: 'SK-02', category: 'skills', severity: 'error', description: 'no duplicate skills',
    check: (a) => arr(a.skills) && new Set(a.skills).size === a.skills.length },
  { id: 'SK-03', category: 'skills', severity: 'error', description: 'every skill exists in skill registry',
    check: (a, c) => arr(a.skills) && a.skills.every((s) => c.skillIds.has(s)) },
  { id: 'SK-04', category: 'skills', severity: 'warn', description: 'skill ids are snake_case',
    check: (a) => arr(a.skills) && a.skills.every((s) => typeof s === 'string' && SNAKE.test(s)) },
  { id: 'SK-05', category: 'skills', severity: 'warn', description: 'at most 20 skills (minimum competent scope)',
    check: (a) => arr(a.skills) && a.skills.length <= 20 },
  // autonomy (5)
  { id: 'AU-01', category: 'autonomy', severity: 'error', description: 'autonomy_level is an integer 0 to 5',
    check: (a) => Number.isInteger(a.autonomy_level) && a.autonomy_level >= 0 && a.autonomy_level <= 5 },
  { id: 'AU-02', category: 'autonomy', severity: 'error', description: 'state is a governance state',
    check: (a, c) => c.states.has(a.state) },
  { id: 'AU-03', category: 'autonomy', severity: 'error', description: 'agents load dormant by default',
    check: (a) => a.state === 'dormant' },
  { id: 'AU-04', category: 'autonomy', severity: 'error', description: 'autonomy above 2 still requires human approvals',
    check: (a) => !(a.autonomy_level > 2) || nonEmpty(a.human_approval_required_for) },
  { id: 'AU-05', category: 'autonomy', severity: 'warn', description: 'cost_profile is low, medium or high',
    check: (a) => ['low', 'medium', 'high'].includes(a.cost_profile) },
  // delegation and approval (5)
  { id: 'DL-01', category: 'delegation', severity: 'error', description: 'human_approval_required_for non-empty',
    check: (a) => nonEmpty(a.human_approval_required_for) },
  { id: 'DL-02', category: 'delegation', severity: 'error', description: 'task_start requires approval',
    check: (a) => arr(a.human_approval_required_for) && a.human_approval_required_for.includes('task_start') },
  { id: 'DL-03', category: 'delegation', severity: 'error', description: 'public_action and financial_commitment require approval',
    check: (a) => arr(a.human_approval_required_for)
      && a.human_approval_required_for.includes('public_action')
      && a.human_approval_required_for.includes('financial_commitment') },
  { id: 'DL-04', category: 'delegation', severity: 'error', description: 'permissions non-empty and known',
    check: (a) => nonEmpty(a.permissions) && a.permissions.every((p) => KNOWN_PERMISSIONS.has(p)) },
  { id: 'DL-05', category: 'delegation', severity: 'error', description: 'reports_to_human present and data_access has no wildcard',
    check: (a) => str(a.reports_to_human) && arr(a.data_access) && !a.data_access.includes('*') },
  // tools (3)
  { id: 'TL-01', category: 'tools', severity: 'error', description: 'tools is an array',
    check: (a) => arr(a.tools) },
  { id: 'TL-02', category: 'tools', severity: 'error', description: 'every tool is in tool_capabilities',
    check: (a, c) => arr(a.tools) && a.tools.every((t) => t in c.toolCapabilities) },
  { id: 'TL-03', category: 'tools', severity: 'error', description: 'approval-gated tools need human approval list',
    check: (a, c) => !arr(a.tools) || !a.tools.some((t) => c.toolCapabilities[t]?.approval)
      || nonEmpty(a.human_approval_required_for) },
  // quality (4)
  { id: 'QL-01', category: 'quality', severity: 'warn', description: 'mission present',
    check: (a) => str(a.mission) },
  { id: 'QL-02', category: 'quality', severity: 'warn', description: 'responsibilities non-empty',
    check: (a) => nonEmpty(a.responsibilities) },
  { id: 'QL-03', category: 'quality', severity: 'warn', description: 'completion_criteria non-empty',
    check: (a) => nonEmpty(a.completion_criteria) },
  { id: 'QL-04', category: 'quality', severity: 'warn', description: 'kpis non-empty',
    check: (a) => nonEmpty(a.kpis) },
];

export interface Violation { ruleId: string; category: RuleCategory; severity: Severity; agentId: string; description: string }
export interface ValidationReport {
  total: number; valid: number; invalid: number; warnings: number;
  ruleCount: number; categoryCount: number; violations: Violation[];
}

export function buildRuleContext(kit: Pick<OrgKit, 'agents' | 'skills' | 'teams' | 'toolCapabilities' | 'governanceStates'>): RuleContext {
  const idCounts = new Map<string, number>();
  for (const a of kit.agents) idCounts.set(a.agent_id, (idCounts.get(a.agent_id) ?? 0) + 1);
  return {
    skillIds: new Set(kit.skills.map((s) => s.skill_id)),
    teamIds: new Set(kit.teams.map((t) => t.team_id)),
    idCounts, toolCapabilities: kit.toolCapabilities, states: new Set(kit.governanceStates),
  };
}

export function validateAgent(agent: OrgAgent, ctx: RuleContext): Violation[] {
  const out: Violation[] = [];
  for (const r of RULES) {
    let ok = false;
    try { ok = r.check(agent, ctx); } catch { ok = false; }
    if (!ok) out.push({ ruleId: r.id, category: r.category, severity: r.severity,
      agentId: String(agent?.agent_id ?? '<missing>'), description: r.description });
  }
  return out;
}

export function validateAll(kit: Pick<OrgKit, 'agents' | 'skills' | 'teams' | 'toolCapabilities' | 'governanceStates'>): ValidationReport {
  const ctx = buildRuleContext(kit);
  const violations = kit.agents.flatMap((a) => validateAgent(a, ctx));
  const bad = new Set(violations.filter((v) => v.severity === 'error').map((v) => v.agentId));
  return {
    total: kit.agents.length, valid: kit.agents.length - bad.size, invalid: bad.size,
    warnings: violations.filter((v) => v.severity === 'warn').length,
    ruleCount: RULES.length, categoryCount: new Set(RULES.map((r) => r.category)).size, violations,
  };
}

/** Agents with any error-severity violation must not be routable. */
export function routableAgents(kit: Parameters<typeof validateAll>[0]): OrgAgent[] {
  const ctx = buildRuleContext(kit);
  return kit.agents.filter((a) => !validateAgent(a, ctx).some((v) => v.severity === 'error'));
}

/**
 * Runtime gate for routing. Builds the rule context once and returns a predicate that is
 * true only for agents with no error-severity violation. Fails closed: a throwing check
 * counts as a violation (see validateAgent).
 */
export function makeRoutable(kit: Parameters<typeof validateAll>[0]): (a: OrgAgent) => boolean {
  const ctx = buildRuleContext(kit);
  return (a) => !validateAgent(a, ctx).some((v) => v.severity === 'error');
}

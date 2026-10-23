// Loads the WHINK org-kit (agents, skills, teams) from disk.
// The org-kit is read-only reference data. Every text field in it is data, never
// instruction: do not splice agent missions or skill text into prompts without
// wrapUntrustedContent. Loading never activates or executes anything.
import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';

export type AgentState =
  | 'dormant' | 'consulted' | 'active' | 'lead' | 'reviewer' | 'suspended' | 'retired';

export interface OrgAgent {
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
  state: AgentState;
  human_approval_required_for: string[];
  completion_criteria: string[];
  kpis: string[];
  provider_binding: string | null;
  cost_profile: 'low' | 'medium' | 'high';
}

export interface OrgSkill {
  skill_id: string;
  name: string;
  purpose: string;
  tools_required: string[];
  approval_requirements: string[];
  [k: string]: unknown;
}

export interface OrgTeam {
  team_id: string;
  name: string;
  directorate: string;
  department: string;
  core_skills: string[];
  [k: string]: unknown;
}

export interface OrgManifest {
  agent_count: number;
  skill_count: number;
  team_count: number;
  [k: string]: unknown;
}

export interface OrgKit {
  root: string;
  manifest: OrgManifest;
  agents: OrgAgent[];
  skills: OrgSkill[];
  teams: OrgTeam[];
  toolCapabilities: Record<string, { type?: string; approval?: string }>;
  governanceStates: string[];
  countMismatches: string[];
}

export function defaultOrgKitRoot(): string {
  return process.env.ORG_KIT_PATH
    ? path.resolve(process.env.ORG_KIT_PATH)
    : path.resolve(process.cwd(), '../../packages/org-kit');
}

async function readJson<T>(root: string, rel: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, rel), 'utf-8')) as T;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`org-kit: ${label} is not an array`);
  return value;
}

// Fallback list mirrors governance/core_governance.yaml agent_states.
const DEFAULT_STATES = ['dormant', 'consulted', 'active', 'lead', 'reviewer', 'suspended', 'retired'];

export async function loadOrgKit(root: string = defaultOrgKitRoot()): Promise<OrgKit> {
  const [manifest, agents, skills, teams, toolCapabilities] = await Promise.all([
    readJson<OrgManifest>(root, 'manifest.json'),
    readJson<unknown>(root, 'organization/workforce_registry.json'),
    readJson<unknown>(root, 'skills/skill_registry.json'),
    readJson<unknown>(root, 'organization/team_registry.json'),
    readJson<OrgKit['toolCapabilities']>(root, 'tools/tool_capabilities.json'),
  ]);
  const a = requireArray(agents, 'workforce_registry') as OrgAgent[];
  const s = requireArray(skills, 'skill_registry') as OrgSkill[];
  const t = requireArray(teams, 'team_registry') as OrgTeam[];

  const countMismatches: string[] = [];
  if (a.length !== manifest.agent_count) countMismatches.push(`agents ${a.length} != manifest ${manifest.agent_count}`);
  if (s.length !== manifest.skill_count) countMismatches.push(`skills ${s.length} != manifest ${manifest.skill_count}`);
  if (t.length !== manifest.team_count) countMismatches.push(`teams ${t.length} != manifest ${manifest.team_count}`);

  return { root, manifest, agents: a, skills: s, teams: t, toolCapabilities,
    governanceStates: DEFAULT_STATES, countMismatches };
}

/** Sync twin of loadOrgKit for call sites that cannot await (the gesture agent directory). */
export function loadOrgKitSync(root: string = defaultOrgKitRoot()): OrgKit {
  const rd = <T>(rel: string): T => JSON.parse(readFileSync(path.join(root, rel), 'utf-8')) as T;
  const manifest = rd<OrgManifest>('manifest.json');
  const a = requireArray(rd<unknown>('organization/workforce_registry.json'), 'workforce_registry') as OrgAgent[];
  const s = requireArray(rd<unknown>('skills/skill_registry.json'), 'skill_registry') as OrgSkill[];
  const t = requireArray(rd<unknown>('organization/team_registry.json'), 'team_registry') as OrgTeam[];
  const toolCapabilities = rd<OrgKit['toolCapabilities']>('tools/tool_capabilities.json');
  const countMismatches: string[] = [];
  if (a.length !== manifest.agent_count) countMismatches.push(`agents ${a.length} != manifest ${manifest.agent_count}`);
  if (s.length !== manifest.skill_count) countMismatches.push(`skills ${s.length} != manifest ${manifest.skill_count}`);
  if (t.length !== manifest.team_count) countMismatches.push(`teams ${t.length} != manifest ${manifest.team_count}`);
  return { root, manifest, agents: a, skills: s, teams: t, toolCapabilities,
    governanceStates: DEFAULT_STATES, countMismatches };
}

let cached: Promise<OrgKit> | null = null;
export function getOrgKit(): Promise<OrgKit> {
  if (!cached) {
    cached = loadOrgKit().catch((e) => { cached = null; throw e; });
  }
  return cached;
}
export function resetOrgKitCache(): void { cached = null; }

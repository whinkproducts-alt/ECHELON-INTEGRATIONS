/**
 * Adapter over the org-kit workforce registry so the gesture router depends on a small
 * interface, not on the registry. Swap by passing a different AgentDirectory.
 *
 * Every agent is run through the agent validator when the directory is built. Agents with
 * any error-severity violation are not exposed: get() returns null for them, exactly as for
 * an unknown id. If the registry cannot be loaded at all, the directory is empty (fail closed).
 */

import { loadOrgKitSync, type OrgKit } from '../agent-loader';
import { buildRuleContext, validateAgent, type Violation } from '../agent-validator';

export interface AgentInfo {
  id: string;
  name: string;
  directorate: string;
  department: string;
  skills: string[];
  /** False for suspended or retired agents. Dormant agents are available: they wake on approval. */
  available: boolean;
}

export interface AgentDirectory {
  get(agentId: string): AgentInfo | null;
}

export interface ValidatedDirectory extends AgentDirectory {
  /** Agent ids rejected at load time, with the error-severity violations that caused it. */
  readonly rejected: ReadonlyMap<string, Violation[]>;
}

export function buildValidatedDirectory(
  kit: Pick<OrgKit, 'agents' | 'skills' | 'teams' | 'toolCapabilities' | 'governanceStates'>,
): ValidatedDirectory {
  const ctx = buildRuleContext(kit);
  const valid = new Map<string, AgentInfo>();
  const rejected = new Map<string, Violation[]>();
  for (const a of kit.agents) {
    const errors = validateAgent(a, ctx).filter((v) => v.severity === 'error');
    const id = String(a?.agent_id ?? '<missing>');
    if (errors.length > 0) { rejected.set(id, errors); continue; }
    valid.set(a.agent_id, {
      id: a.agent_id,
      name: a.name,
      directorate: a.directorate,
      department: a.department,
      skills: [...a.skills],
      available: a.state !== 'suspended' && a.state !== 'retired',
    });
  }
  return { rejected, get: (agentId) => valid.get(agentId) ?? null };
}

let cached: ValidatedDirectory | null = null;
function loadDirectory(): ValidatedDirectory {
  if (cached) return cached;
  try {
    cached = buildValidatedDirectory(loadOrgKitSync());
    if (cached.rejected.size > 0) {
      console.warn(`agent-directory: ${cached.rejected.size} agent(s) rejected by validator`);
    }
  } catch {
    console.error('agent-directory: org-kit failed to load, exposing no agents');
    return { rejected: new Map(), get: () => null }; // not cached so a later call can retry
  }
  return cached;
}

export const orgKitDirectory: AgentDirectory = {
  get: (agentId) => loadDirectory().get(agentId),
};

export function resetOrgKitDirectoryCache(): void { cached = null; }

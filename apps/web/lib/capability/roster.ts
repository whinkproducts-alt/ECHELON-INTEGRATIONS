/**
 * Canonical identities for grants. Subjects are the org-kit agent_id / team_id values: the roster of
 * 326 agents and 163 teams is read, never written. A grant to an id that is not in the roster is refused,
 * and the team of an agent is derived from the roster here, never taken from the caller.
 */
import { getOrgKit } from '@/lib/agent-loader';

export interface ResolvedAgent {
  agentId: string;
  teamId: string | null;
  state: string;
}

/** team_id is the agent_id without its final segment (verified against the roster, not assumed). */
function teamIdOf(agentId: string): string {
  return agentId.split('.').slice(0, -1).join('.');
}

export async function resolveAgent(agentId: string): Promise<ResolvedAgent | null> {
  if (typeof agentId !== 'string' || !agentId) return null;
  const kit = await getOrgKit();
  const a = kit.agents.find((x) => x.agent_id === agentId);
  if (!a) return null;
  const tid = teamIdOf(agentId);
  const team = kit.teams.find((t) => t.team_id === tid);
  return { agentId: a.agent_id, teamId: team ? team.team_id : null, state: a.state };
}

export async function teamExists(teamId: string): Promise<boolean> {
  if (typeof teamId !== 'string' || !teamId) return false;
  const kit = await getOrgKit();
  return kit.teams.some((t) => t.team_id === teamId);
}

/** Agents in these states never act, whatever grants exist. Dormant agents may be granted work by the Founder. */
export function agentMayAct(state: string): boolean {
  return state !== 'suspended' && state !== 'retired';
}

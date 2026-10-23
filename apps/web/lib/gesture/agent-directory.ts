/**
 * Adapter over the org-kit workforce registry so the gesture router depends on a small
 * interface, not on the registry. Swap by passing a different AgentDirectory.
 */

import { getAgent } from '@whink/org-kit';

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

export const orgKitDirectory: AgentDirectory = {
  get(agentId) {
    const a = getAgent(agentId);
    if (!a) return null;
    return {
      id: a.agent_id,
      name: a.name,
      directorate: a.directorate,
      department: a.department,
      skills: a.skills,
      available: a.state !== 'suspended' && a.state !== 'retired',
    };
  },
};

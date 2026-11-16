/**
 * R13 mission activation. A mission (a swarm run, a Marcus task) wakes only the agents it needs from `dormant`
 * and returns them to `dormant` when it ends, whatever way it ends (see withMissionAgents).
 *
 * The org-kit registry is read-only data, so the live state is a row in mission_activations. Waking changes a
 * label only: it creates no grant, no delegation and no permission. Every action an awake agent attempts still
 * goes through the permission engine, and protected (money / proprietary) actions stay Class C. This module
 * deliberately imports nothing from the permission engine so it cannot widen it.
 */
import { prisma } from '@/lib/db';
import { getOrgKit } from '@/lib/agent-loader';
import { agentMayAct } from '@/lib/capability/roster';
import { recordActionSafe } from '@/lib/ledger';
import { isLockedDown } from '@/lib/safety/lockdown';

export const MAX_WOKEN_PER_MISSION = 12;

export type WakeResult =
  | { ok: true; woken: string[]; alreadyAwake: string[] }
  | { ok: false; error: 'lockdown' | 'too_many_agents' | 'unknown_agent' | 'agent_not_available'; detail?: string };

async function ledger(userId: string, action: string, missionId: string, summary: string) {
  await recordActionSafe({ userId, initiator: 'system', persona: 'WHINK', action, tool: 'mission_activation', permissionClass: 'A', status: 'EXECUTED', inputSummary: summary.slice(0, 500), correlationId: missionId });
}

/** Wake exactly the named agents for a mission. Agents already awake for another mission stay awake for both. */
export async function wakeForMission(userId: string, missionId: string, agentIds: string[]): Promise<WakeResult> {
  if (!userId || !missionId) throw new Error('wakeForMission: userId and missionId are required');
  const ids = [...new Set(agentIds)];
  if (ids.length > MAX_WOKEN_PER_MISSION) return { ok: false, error: 'too_many_agents', detail: `${ids.length} > ${MAX_WOKEN_PER_MISSION}` };
  if (await isLockedDown(userId)) return { ok: false, error: 'lockdown' };
  const kit = await getOrgKit();
  for (const id of ids) {
    const a = kit.agents.find((x) => x.agent_id === id);
    if (!a) return { ok: false, error: 'unknown_agent', detail: id };
    if (!agentMayAct(a.state)) return { ok: false, error: 'agent_not_available', detail: `${id} is ${a.state}` };
  }
  const woken: string[] = []; const alreadyAwake: string[] = [];
  for (const id of ids) {
    const live = await prisma.missionActivation.findFirst({ where: { userId, agentId: id, status: 'ACTIVE' } });
    const mine = await prisma.missionActivation.upsert({
      where: { userId_missionId_agentId: { userId, missionId, agentId: id } },
      create: { userId, missionId, agentId: id },
      update: { status: 'ACTIVE', returnedAt: null },
    });
    void mine;
    (live ? alreadyAwake : woken).push(id);
  }
  if (ids.length) await ledger(userId, 'mission_agents_woken', missionId, `woke=${woken.join(',') || '-'} already_awake=${alreadyAwake.join(',') || '-'}`);
  return { ok: true, woken, alreadyAwake };
}

/** Return every agent this mission woke to dormant. Idempotent. Returns how many were returned. */
export async function returnToDormant(userId: string, missionId: string): Promise<number> {
  const r = await prisma.missionActivation.updateMany({ where: { userId, missionId, status: 'ACTIVE' }, data: { status: 'RETURNED', returnedAt: new Date() } });
  if (r.count > 0) await ledger(userId, 'mission_agents_dormant', missionId, `returned=${r.count}`);
  return r.count;
}

/** Wake for the duration of fn and ALWAYS return to dormant, even when fn throws. */
export async function withMissionAgents<T>(userId: string, missionId: string, agentIds: string[], fn: () => Promise<T>): Promise<T> {
  const w = await wakeForMission(userId, missionId, agentIds);
  if (!w.ok) throw new Error(`mission activation refused: ${w.error}${w.detail ? ` (${w.detail})` : ''}`);
  try { return await fn(); } finally { await returnToDormant(userId, missionId); }
}

/** Live state: awake for any active mission wins over the registry state; otherwise the registry state. */
export async function effectiveAgentState(userId: string, agentId: string, registryState: string): Promise<string> {
  if (registryState !== 'dormant') return registryState;
  const live = await prisma.missionActivation.findFirst({ where: { userId, agentId, status: 'ACTIVE' }, select: { id: true } });
  return live ? 'active' : 'dormant';
}

/** Safety net for a crashed process: return anything awake longer than maxAgeMs. */
export async function reapStaleActivations(userId: string, maxAgeMs = 6 * 3_600_000, now = new Date()): Promise<number> {
  const r = await prisma.missionActivation.updateMany({ where: { userId, status: 'ACTIVE', activatedAt: { lt: new Date(now.getTime() - maxAgeMs) } }, data: { status: 'RETURNED', returnedAt: now } });
  if (r.count > 0) await ledger(userId, 'mission_agents_dormant', 'reaper', `reaped=${r.count}`);
  return r.count;
}

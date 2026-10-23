/**
 * Gesture to directorate router.
 *
 * recognition -> intent table -> permission engine -> action -> HOLO state -> ledger.
 *
 * Rules held here:
 * - The permission engine decides before anything runs. Denials are ledgered.
 * - No gesture decides an approval. "point" creates an EAR that waits for the card.
 * - Client hints (taskId, agentId) are re-verified against the database / registry.
 * - Ledger rows carry the gesture name and confidence only. No landmark coordinates.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordActionSafe, type LedgerStatus } from '@/lib/ledger';
import { checkPermission } from '@/lib/permission-engine';
import { createApproval } from '@/lib/approvals';
import { extractRequiredSkills } from '@/lib/task-gate';
import type { ExecutionAuthorizationRequest } from '@whink/org-kit';
import { orgKitDirectory, type AgentDirectory, type AgentInfo } from './agent-directory';
import { holoBridge, type HoloAction, type HoloBridge, type HoloState } from './holo-bridge';
import { INTENTS, type IntentName } from './intents';
import type { GestureRequest, Recognition } from './types';

export type DispatchStatus =
  | 'executed'
  | 'denied'
  | 'below_threshold'
  | 'ignored_paused'
  | 'needs_context'
  | 'rejected'
  | 'failed';

export interface DispatchResult {
  status: DispatchStatus;
  intent: IntentName;
  permissionClass: 'A' | 'B';
  reason?: string;
  approvalId?: string;
  skillMatch?: { required: string[]; matched: string[]; gaps: string[] };
  state?: HoloState;
}

export interface DispatchDeps {
  bridge: HoloBridge;
  agents: AgentDirectory;
  now: () => number;
}

const defaultDeps = (): DispatchDeps => ({ bridge: holoBridge, agents: orgKitDirectory, now: Date.now });

const clean = (s: string, max: number): string =>
  s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Pure. Builds the EAR for a point gesture with the pointed agent as lead. */
export function buildPointEar(
  task: { title: string; description?: string | null },
  agent: AgentInfo,
): { ear: ExecutionAuthorizationRequest; match: { required: string[]; matched: string[]; gaps: string[] } } {
  const required = extractRequiredSkills(`${task.title} ${task.description ?? ''}`);
  const have = new Set(agent.skills);
  const matched = required.filter((s) => have.has(s));
  const gaps = required.filter((s) => !have.has(s));
  const objective = clean(task.title, 200) || 'Task';
  const ear: ExecutionAuthorizationRequest = {
    status: 'AWAITING_HUMAN_APPROVAL',
    objective,
    owning_directorate: agent.directorate,
    owning_department: agent.department,
    lead_agent: agent.name,
    supporting_agents: [],
    team_size: 1,
    why_sufficient:
      required.length === 0
        ? 'Directed by gesture. No required skills could be derived from the task text.'
        : `Directed by gesture. Agent covers ${matched.length}/${required.length} derived skills. Gaps: ${gaps.length ? gaps.join(', ') : 'none'}.`,
    required_skills: required,
    capability_gaps: gaps,
    schedule: 'To be confirmed by Founder',
    milestones: [],
    estimated_budget: 'Requires provider rate card, submit after approval',
    assumptions: ['Agent chosen by hand gesture, not by the router.'],
    risks: gaps.length > 0 ? [`Capability gap in: ${gaps.join(', ')}`] : [],
    approval_required: true,
    execution_allowed: false,
  };
  return { ear, match: { required, matched, gaps } };
}

async function ownedTask(userId: string, taskId: string) {
  return prisma.projectTask.findFirst({
    where: { id: taskId, project: { ownerId: userId } },
    select: { id: true, title: true, description: true },
  });
}

export async function dispatchGesture(
  userId: string,
  rec: Recognition,
  req: Pick<GestureRequest, 'target'>,
  correlationId: string,
  deps: DispatchDeps = defaultDeps(),
): Promise<DispatchResult> {
  const def = INTENTS[rec.gesture];
  const base = { intent: def.intent, permissionClass: def.permissionClass } as const;
  const total = rec.confidence.total;

  if (total < def.minConfidence) {
    return { ...base, status: 'below_threshold', reason: `confidence ${total} below ${def.minConfidence}` };
  }

  const current = deps.bridge.getState(userId);
  if (current.mode === 'paused' && def.intent !== 'wake') {
    return { ...base, status: 'ignored_paused', state: current };
  }

  const [perm, persona] = await Promise.all([
    checkPermission(userId, def.capability, def.permissionClass, correlationId),
    prisma.personaState.findUnique({ where: { userId }, select: { activePersona: true, mambaMode: true } }),
  ]);
  const ledgerBase = {
    userId,
    initiator: 'user' as const,
    persona: persona?.activePersona ?? 'WHINK',
    mambaMode: persona?.mambaMode ?? null,
    tool: def.capability,
    action: `gesture: ${rec.gesture} -> ${def.intent}`,
    permissionClass: def.permissionClass,
    inputSummary: `gesture=${rec.gesture} confidence=${total}/300`,
    correlationId,
  };
  const note = (status: LedgerStatus, out: string, confirmationMethod?: string) =>
    recordActionSafe({ ...ledgerBase, status, outputSummary: out, confirmationMethod });

  if (!perm.allowed) {
    await note('DENIED', perm.reason ?? 'permission denied');
    return { ...base, status: 'denied', reason: perm.reason ?? 'permission denied' };
  }

  try {
    let action: HoloAction;
    let extra: Partial<DispatchResult> = {};

    switch (def.intent) {
      case 'open_thread': {
        const taskId = req.target?.taskId;
        if (taskId) {
          const task = await ownedTask(userId, taskId);
          if (!task) {
            await note('DENIED', 'task not found');
            return { ...base, status: 'rejected', reason: 'task not found' };
          }
          action = { intent: 'open_thread', taskId: task.id };
        } else {
          action = { intent: 'open_thread', taskId: null };
        }
        break;
      }
      case 'propose_task': {
        const agentId = req.target?.agentId;
        if (!current.openTaskId || !agentId) {
          return { ...base, status: 'needs_context', reason: !current.openTaskId ? 'open a task thread first (pinch)' : 'no agent targeted' };
        }
        const task = await ownedTask(userId, current.openTaskId);
        const agent = deps.agents.get(agentId);
        if (!task) {
          await note('DENIED', 'task not found');
          return { ...base, status: 'rejected', reason: 'task not found' };
        }
        if (!agent || !agent.available) {
          await note('DENIED', 'agent unavailable');
          return { ...base, status: 'rejected', reason: 'agent unavailable' };
        }
        const { ear, match } = buildPointEar(task, agent);
        const approval = await createApproval({
          userId,
          kind: 'ear',
          params: { ...ear, taskId: task.id, agentId: agent.id, source: 'gesture' },
          persona: ledgerBase.persona,
          correlationId,
        });
        action = { intent: 'propose_task', approvalId: approval.id };
        extra = { approvalId: approval.id, skillMatch: match };
        break;
      }
      case 'select': {
        const agentId = req.target?.agentId;
        const agent = agentId ? deps.agents.get(agentId) : null;
        action = { intent: 'select', agentId: agent?.available ? agent.id : null };
        break;
      }
      case 'next': {
        const d = rec.detail.direction;
        action = { intent: 'next', step: d === 'left' || d === 'up' ? -1 : 1 };
        break;
      }
      case 'request_brief': action = { intent: 'request_brief' }; break;
      case 'dismiss': action = { intent: 'dismiss' }; break;
      case 'toggle_overview': action = { intent: 'toggle_overview' }; break;
      case 'pause': action = { intent: 'pause' }; break;
      case 'wake': action = { intent: 'wake' }; break;
      case 'refresh': action = { intent: 'refresh' }; break;
    }

    const state = deps.bridge.apply(userId, action, rec.gesture, deps.now());
    deps.bridge.publish(userId, {
      type: 'gesture', gesture: rec.gesture, intent: def.intent, status: 'executed',
      confidence: total, correlationId, at: deps.now(),
    });
    await note('VALIDATED', extra.approvalId ? `proposal ${extra.approvalId}` : 'applied', perm.method);
    return { ...base, status: 'executed', state, ...extra };
  } catch (e) {
    logger.error('gesture dispatch failed', { userId, correlationId, gesture: rec.gesture, error: (e as Error)?.message });
    await note('FAILED', 'dispatch error');
    return { ...base, status: 'failed', reason: 'dispatch error' };
  }
}

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordAction, type LedgerStatus } from '@/lib/ledger';
import { approvalContentHash, toolArgsHash } from '@/lib/canonical-json';
import { classifyProtected, type ProtectedCategory } from '@/lib/protected-actions';

export type PermissionClass = 'A' | 'B' | 'C';

/**
 * Registered capabilities for server-side (non tool-call) actions. The class here is the
 * truth: a caller that asks for a lower class than registered is refused, and an unregistered
 * capability is Class C (never runs without a human). Tool-call classes live in tool-registry.
 */
export const CAPABILITY_CLASSES: Readonly<Record<string, PermissionClass>> = Object.freeze({
  board_meeting_create: 'A',
  board_minutes_write: 'A',
  connector_manage: 'B',
  usage_budget_set: 'A',
  contact_create: 'A',
  contact_update: 'A',
  contact_delete: 'A',
  contact_import: 'A',
  contact_message: 'C',
  contact_call: 'C',
  project_create: 'A',
  project_update: 'A',
  worker_memory_write: 'A',
  recommendation_write: 'A',
  skill_memory_write: 'A',
  skill_intake: 'A',
  contract_create: 'A',
  contract_update: 'A',
  contract_delete: 'A',
  change_request_create: 'A',
  change_request_update: 'A',
  change_request_refine: 'A',
  change_request_status: 'A',
  change_request_submit: 'C',
  meeting_room_create: 'A',
  swarm_plan: 'A',
  swarm_start: 'A',
  swarm_cancel: 'A',
  swarm_memory_write: 'A',
});

export function capabilityClass(capability: string): PermissionClass {
  if (classifyProtected({ toolName: capability, capability }).protected) return 'C';
  return Object.prototype.hasOwnProperty.call(CAPABILITY_CLASSES, capability) ? CAPABILITY_CLASSES[capability] : 'C';
}

interface PermissionCheckResult {
  allowed: boolean;
  method: 'auto' | 'delegated' | 'requires_confirmation' | 'human_approved';
  reason?: string;
  /** True when the action is money movement or disclosure of proprietary information. Always Class C. */
  protected?: boolean;
  category?: ProtectedCategory;
}

export async function checkPermission(
  userId: string,
  capability: string,
  permissionClass: PermissionClass,
  _correlationId?: string,
  /** What the call carries: its parameters, and whether external content has entered the turn. */
  ctx: { params?: unknown; tainted?: boolean; description?: string } = {}
): Promise<PermissionCheckResult> {
  // Protected actions (money, proprietary egress) are decided first and cannot be lowered by
  // anything below: not the requested class, autonomy, a delegation row, persona or allow-list.
  const prot = classifyProtected({ toolName: capability, capability, params: ctx.params, tainted: ctx.tainted, description: ctx.description });
  if (prot.protected) {
    const downgrade = permissionClass !== 'C';
    if (downgrade) {
      try {
        await logSecurityEvent(userId, 'protected_action_downgrade_refused', `${capability} requested as Class ${permissionClass}; protected (${prot.category}) actions are always Class C`, _correlationId, 'DENIED');
      } catch { /* the refusal stands even if the ledger is down */ }
    }
    return {
      allowed: false,
      method: 'requires_confirmation',
      protected: true,
      category: prot.category,
      reason: downgrade
        ? `Protected ${prot.category} action: always Class C, a lower class was refused. Owner approval by request id is required.`
        : `Protected ${prot.category} action: always requires the owner's explicit approval by request id.`,
    };
  }

  // Get user's autonomy level
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  const autonomyLevel = profile?.autonomyLevel ?? 1;

  // Class A: auto for autonomy >= 0
  if (permissionClass === 'A') {
    return { allowed: true, method: 'auto' };
  }

  // Class C: always requires explicit human approval — no autonomy bypass, no delegation bypass
  if (permissionClass === 'C') {
    return { allowed: false, reason: 'Class C actions always require explicit human approval. Contact WHINK to queue an approval.', method: 'requires_confirmation' };
  }

  // Check for delegation (Class B only — Class C is already handled above)
  const delegation = await prisma.delegation.findFirst({
    where: {
      userId,
      capability,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  if (delegation) {
    return { allowed: true, method: 'delegated' };
  }

  // Class B: auto for autonomy >= 2
  if (permissionClass === 'B') {
    if (autonomyLevel >= 2) {
      return { allowed: true, method: 'auto' };
    }
    return { allowed: false, method: 'requires_confirmation', reason: 'Class B action requires autonomy level 2+ or delegation' };
  }

  return { allowed: false, method: 'requires_confirmation' };
}

/**
 * Approval-aware path for Class C. The only way a Class C action may run.
 * Allowed only when the approval row (scoped by userId) was moved to EXECUTING by the
 * winning atomic decision, names this capability, the stored content still hashes to
 * the hash the human saw, and the decision was made before expiry. Autonomy level and
 * delegations are never consulted: they cannot substitute for a human decision.
 */
export async function checkApprovedAction(
  userId: string,
  approvalId: string,
  capability: string,
  contentHash: string
): Promise<PermissionCheckResult> {
  const deny = (reason: string): PermissionCheckResult => ({ allowed: false, method: 'requires_confirmation', reason });
  if (!userId || !approvalId) return deny('Approval required');
  const row = await prisma.approvalRequest.findFirst({ where: { id: approvalId, userId } });
  if (!row) return deny('Approval not found');
  if (row.status !== 'EXECUTING') return deny(`Approval is ${row.status}, not approved for execution`);
  if (row.executedAt) return deny('Approval already consumed');
  if ((row.tool ?? row.kind) !== capability) return deny('Approval does not match this action');
  if (!row.decidedAt || row.decidedAt.getTime() > row.expiresAt.getTime()) return deny('Approval was not decided before expiry');
  let recomputed: string;
  try {
    recomputed = approvalContentHash({ kind: row.kind, tool: row.tool, params: row.params });
  } catch {
    return deny('Approved content hash mismatch');
  }
  if (recomputed !== row.contentHash || contentHash !== row.contentHash) return deny('Approved content hash mismatch');
  return { allowed: true, method: 'human_approved' };
}

/**
 * Permission check for the moment a human-approved scheduled post is sent. The approval
 * was consumed (EXECUTED) when the schedule was created, so this is a separate, narrower
 * path: the approval must belong to this user, be a scheduled_post approval that was
 * executed, still hash to what the human saw, and its approved {tool, args} must hash to
 * the hash held by the scheduled row, and the approved definition hash must equal the live one. Autonomy and delegations are never consulted.
 */
export const SCHEDULED_DEF_CHANGED = 'Tool definition changed since approval; not sent';

export async function checkScheduledSend(
  userId: string,
  approvalId: string,
  scheduled: { tool: string; args: unknown; contentHash: string; liveDefHash: string | null }
): Promise<PermissionCheckResult> {
  const deny = (reason: string): PermissionCheckResult => ({ allowed: false, method: 'requires_confirmation', reason });
  if (!userId || !approvalId) return deny('Approval required');
  const row = await prisma.approvalRequest.findFirst({ where: { id: approvalId, userId } });
  if (!row) return deny('Approval not found');
  if (row.kind !== 'scheduled_post') return deny('Approval does not match this action');
  if (row.status !== 'EXECUTED') return deny(`Approval is ${row.status}, not approved`);
  try {
    if (approvalContentHash({ kind: row.kind, tool: row.tool, params: row.params }) !== row.contentHash) {
      return deny('Approved content hash mismatch');
    }
    const p = row.params as { tool?: unknown; args?: unknown } | null;
    if (!p || typeof p.tool !== 'string' || p.tool !== scheduled.tool) return deny('Approval does not match this action');
    const approvedHash = toolArgsHash({ tool: p.tool, args: p.args });
    if (approvedHash !== scheduled.contentHash || toolArgsHash(scheduled) !== approvedHash) {
      return deny('Scheduled content does not match the approved content');
    }
    // The tool definition the human approved must be the live one. Absent or different: not sent.
    const approvedDef = (row.params as { defHash?: unknown } | null)?.defHash;
    if (typeof approvedDef !== 'string' || !scheduled.liveDefHash || approvedDef !== scheduled.liveDefHash) {
      return deny(SCHEDULED_DEF_CHANGED);
    }
  } catch {
    return deny('Approved content hash mismatch');
  }
  return { allowed: true, method: 'human_approved' };
}

// Log persona authority bypass attempts
export function checkMetaAuthorization(message: string): boolean {
  const bypassPatterns = [
    /do it without asking/i,
    /skip (the )?confirmation/i,
    /bypass (the )?permission/i,
    /override (the )?security/i,
    /grant (yourself |me )?permission/i,
    /you('re| are) authorized/i,
    /I('m| am) authorizing you/i,
  ];
  return bypassPatterns.some((p: RegExp) => p.test(message));
}

export async function logSecurityEvent(
  userId: string,
  event: string,
  details: string,
  correlationId?: string,
  status: LedgerStatus = 'VALIDATED'
) {
  logger.security(event, { userId, details });
  await recordAction({
    userId,
    initiator: 'system',
    persona: 'WHINK',
    action: `SECURITY_EVENT: ${event}`,
    permissionClass: 'C',
    status,
    inputSummary: details,
    correlationId,
  });
}

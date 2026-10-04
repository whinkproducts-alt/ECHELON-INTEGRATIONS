import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordAction, type LedgerStatus } from '@/lib/ledger';
import { approvalContentHash, toolArgsHash } from '@/lib/canonical-json';

export type PermissionClass = 'A' | 'B' | 'C';

interface PermissionCheckResult {
  allowed: boolean;
  method: 'auto' | 'delegated' | 'requires_confirmation' | 'human_approved';
  reason?: string;
}

export async function checkPermission(
  userId: string,
  capability: string,
  permissionClass: PermissionClass,
  _correlationId?: string
): Promise<PermissionCheckResult> {
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

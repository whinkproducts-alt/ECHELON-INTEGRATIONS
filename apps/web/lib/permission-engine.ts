import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordAction, type LedgerStatus } from '@/lib/ledger';
import { approvalContentHash } from '@/lib/canonical-json';

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
  if ((row.tool ?? row.kind) !== capability) return deny('Approval does not match this action');
  if (!row.decidedAt || row.decidedAt.getTime() > row.expiresAt.getTime()) return deny('Approval was not decided before expiry');
  const recomputed = approvalContentHash({ kind: row.kind, tool: row.tool, params: row.params });
  if (recomputed !== row.contentHash || contentHash !== row.contentHash) return deny('Approved content hash mismatch');
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

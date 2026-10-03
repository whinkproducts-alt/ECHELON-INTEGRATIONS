import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export type PermissionClass = 'A' | 'B' | 'C';

interface PermissionCheckResult {
  allowed: boolean;
  method: 'auto' | 'delegated' | 'requires_confirmation';
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
  correlationId?: string
) {
  logger.security(event, { userId, details });
  await prisma.action.create({
    data: {
      userId,
      initiator: 'system',
      persona: 'WHINK',
      action: `SECURITY_EVENT: ${event}`,
      permissionClass: 'C',
      status: 'VALIDATED',
      inputSummary: details,
      correlationId,
    },
  });
}

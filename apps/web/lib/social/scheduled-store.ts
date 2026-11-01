/**
 * Low-level scheduled-post row operations that do not need the approval or gateway machinery.
 * Kept separate so lib/social/oauth.ts and lib/social/connections.ts can use them without an
 * import cycle through lib/social/scheduler.ts. Every query is scoped by userId.
 */

import { prisma } from '@/lib/db';
import { recordActionSafe } from '@/lib/ledger';
import { GATEWAY_TOOL_PREFIX } from '@/lib/gateway-access';
import type { SocialPlatform } from '@/lib/social/platforms';

/** The one schedulable tool: an X post. Built from the gateway prefix so no gateway tool name is hardcoded. */
export const SCHEDULED_POST_TOOL = `${GATEWAY_TOOL_PREFIX}x__post` as const;

/** Cancel every not-yet-sending scheduled post for the user and platform. One ledger row each. */
export async function cancelScheduledRowsForPlatform(
  userId: string,
  platform: SocialPlatform,
  reason: string,
): Promise<number> {
  if (!userId) throw new Error('social: userId is required');
  const rows = await prisma.scheduledPost.findMany({
    where: { userId, platform, status: 'scheduled' },
    select: { id: true },
  });
  let cancelled = 0;
  for (const r of rows) {
    const res = await prisma.scheduledPost.updateMany({
      where: { id: r.id, userId, status: 'scheduled' },
      data: { status: 'cancelled', error: reason },
    });
    if (res.count !== 1) continue;
    cancelled++;
    await recordActionSafe({
      userId,
      initiator: 'system',
      tool: SCHEDULED_POST_TOOL,
      action: 'scheduled_post_cancelled',
      permissionClass: 'C',
      status: 'VALIDATED',
      outputSummary: reason,
      validationResult: JSON.stringify({ scheduledPostId: r.id }),
    });
  }
  return cancelled;
}

/** Delete (not just cancel) every scheduled-post row for the user and platform, any status. */
export async function deleteScheduledRowsForPlatform(userId: string, platform: SocialPlatform): Promise<number> {
  if (!userId) throw new Error('social: userId is required');
  const res = await prisma.scheduledPost.deleteMany({ where: { userId, platform } });
  return res.count;
}

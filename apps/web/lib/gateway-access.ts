/**
 * Who may use gateway (OpenClaw) tools. The gateway's upstream credentials are
 * operator-wide, so until per-tenant credentials exist the gateway is
 * owner-only: a user id listed in OPENCLAW_ALLOWED_USER_IDS (comma-separated;
 * empty means nobody), or a user whose stored role is 'owner'. The role column
 * is set only on the server (signup writes 'user'; no route lets a user change
 * it), so it cannot be self-granted. Fails closed on any lookup error.
 */

import { prisma } from '@/lib/db';

export const GATEWAY_TOOL_PREFIX = 'openclaw__';

export function isGatewayTool(toolName: string): boolean {
  return toolName.startsWith(GATEWAY_TOOL_PREFIX);
}

function allowedIds(): Set<string> {
  return new Set(
    (process.env.OPENCLAW_ALLOWED_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function canUseGateway(userId: string): Promise<boolean> {
  if (!userId) return false;
  if (allowedIds().has(userId)) return true;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return user?.role === 'owner';
  } catch {
    return false;
  }
}

/**
 * Who may use gateway (OpenClaw) tools. The gateway's upstream credentials are
 * operator-wide, so until per-tenant credentials exist the gateway is
 * owner-only: a user id listed in OPENCLAW_ALLOWED_USER_IDS (comma-separated;
 * empty means nobody). Nothing stored on the user record, including role, grants
 * access: the list lives in server configuration only, so it cannot be self-granted.
 */

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
  return allowedIds().has(userId);
}

/**
 * Who may use gateway (OpenClaw) tools. Most upstream credentials are
 * operator-wide, so those platforms are owner-only: a user id listed in
 * OPENCLAW_ALLOWED_USER_IDS (comma-separated; empty means nobody). Nothing stored
 * on the user record, including role, grants access: the list lives in server
 * configuration only, so it cannot be self-granted.
 *
 * Exception (Phase 2d): the social platforms x, instagram and tiktok use the
 * calling user's own OAuth credential, so any authenticated user may use them.
 * A social call is only ever sent with that user's own connection (see
 * lib/social/execute.ts); with no connection WHINK answers not_connected itself.
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

/** Platforms whose gateway calls carry the caller's own per-user credential. */
export const SOCIAL_GATEWAY_PLATFORMS = ['x', 'instagram', 'tiktok'] as const;
export type SocialGatewayPlatform = (typeof SOCIAL_GATEWAY_PLATFORMS)[number];

/** Platform of an `openclaw__<platform>__<tool>` name when it is a social platform, else null. */
export function socialPlatformOf(toolName: string): SocialGatewayPlatform | null {
  if (!isGatewayTool(toolName)) return null;
  const rest = toolName.slice(GATEWAY_TOOL_PREFIX.length);
  const platform = rest.split('__')[0];
  return (SOCIAL_GATEWAY_PLATFORMS as readonly string[]).includes(platform) && rest.length > platform.length + 2
    ? (platform as SocialGatewayPlatform)
    : null;
}

export function isSocialTool(toolName: string): boolean {
  return socialPlatformOf(toolName) !== null;
}

/**
 * May this user call this specific gateway tool? Social tools: any authenticated user.
 * Everything else: the owner allow-list only.
 */
export async function canUseGatewayTool(userId: string, toolName: string): Promise<boolean> {
  if (!userId) return false;
  if (isSocialTool(toolName)) return true;
  return canUseGateway(userId);
}

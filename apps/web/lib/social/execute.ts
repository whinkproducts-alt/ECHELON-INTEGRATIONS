/**
 * The one path for a social gateway call. Used by executeTool, executeApprovedTool
 * and the scheduled-post worker, so the credential handling is identical everywhere.
 *
 * - Loads the caller's own connection (userId-scoped). No active connection means a
 *   not_connected result and NO gateway call.
 * - An expired access token is refreshed first (see loadCredential).
 * - The credential goes to callOpenClawTool as an option (MCP _meta), never in params.
 */

import { callOpenClawTool } from '@/lib/openclaw-client';
import { loadCredential } from '@/lib/social/connections';
import type { SocialPlatform } from '@/lib/social/platforms';

export type SocialCallResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

const LABEL: Record<SocialPlatform, string> = { x: 'X', instagram: 'Instagram', tiktok: 'TikTok' };

export function notConnectedMessage(platform: SocialPlatform, expired: boolean): string {
  return expired
    ? `not_connected: the ${LABEL[platform]} connection has expired. Reconnect it in Settings, Connected Apps.`
    : `not_connected: ${LABEL[platform]} is not connected. Connect it in Settings, Connected Apps.`;
}

/**
 * @param gatewayName the gateway-side tool name, for example `x__read_mentions`.
 */
export async function callSocialTool(
  userId: string,
  platform: SocialPlatform,
  gatewayName: string,
  params: unknown,
): Promise<SocialCallResult> {
  const cred = await loadCredential(userId, platform);
  if (!cred.ok) return { success: false, error: notConnectedMessage(platform, cred.reason === 'expired') };
  const data = await callOpenClawTool(gatewayName, params, { credential: cred.credential });
  return { success: true, data };
}

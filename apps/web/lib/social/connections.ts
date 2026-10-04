/**
 * Social connection storage and credential loading. Every query is scoped by userId.
 * Tokens are decrypted only inside loadCredential, for one gateway call, and are
 * never returned by any list or status function.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordActionSafe } from '@/lib/ledger';
import { decryptKey, encryptKey } from '@/lib/key-encryption';
import { PLATFORM_CONFIG, SOCIAL_PLATFORMS, type SocialPlatform } from '@/lib/social/platforms';
import { postTokenRequest } from '@/lib/social/oauth';

export interface ConnectionView {
  platform: SocialPlatform;
  status: 'not_connected' | 'connected' | 'expired';
  handle: string | null;
  connectedAt: string | null;
  scopes: string[];
}

/** Refresh this long before the stored expiry. */
const REFRESH_SKEW_MS = 60_000;

/** The fields safe to read for listing. Token columns are never selected here. */
const VIEW_SELECT = { platform: true, status: true, platformHandle: true, createdAt: true, scopes: true } as const;

export async function listConnections(userId: string): Promise<ConnectionView[]> {
  if (!userId) throw new Error('social: userId is required');
  const rows = await prisma.socialConnection.findMany({ where: { userId }, select: VIEW_SELECT });
  return SOCIAL_PLATFORMS.map((platform): ConnectionView => {
    const r = rows.find((x) => x.platform === platform);
    if (!r || r.status === 'revoked') return { platform, status: 'not_connected', handle: null, connectedAt: null, scopes: [] };
    return {
      platform,
      status: r.status === 'active' ? 'connected' : 'expired',
      handle: r.platformHandle,
      connectedAt: r.createdAt.toISOString(),
      scopes: r.scopes.split(/[\s,]+/).filter(Boolean),
    };
  });
}

/** Whether this user has an active connection for the platform. No token is read. */
export async function hasActiveConnection(userId: string, platform: SocialPlatform): Promise<boolean> {
  if (!userId) return false;
  const n = await prisma.socialConnection.count({ where: { userId, platform, status: 'active' } });
  return n > 0;
}

export type CredentialResult =
  | { ok: true; credential: string }
  | { ok: false; reason: 'not_connected' | 'expired' };

async function markExpired(userId: string, platform: SocialPlatform): Promise<void> {
  const res = await prisma.socialConnection.updateMany({
    where: { userId, platform, status: 'active' },
    data: { status: 'expired' },
  });
  if (res.count === 1) {
    await recordActionSafe({
      userId,
      initiator: 'system',
      action: 'social_connection_expired',
      tool: `social:${platform}`,
      permissionClass: 'A',
      status: 'FAILED',
      outputSummary: 'Token expired and could not be refreshed',
    });
  }
}

function buildCredential(accessToken: string, platformUserId: string | null): string {
  return JSON.stringify({ access_token: accessToken, platform_user_id: platformUserId ?? '' });
}

/**
 * Load the caller's credential for one call, refreshing an expired access token first.
 * Refresh is optimistic-concurrency: the new tokens are written only if the stored refresh
 * token is still the one we used, so two racing refreshes cannot clobber each other.
 */
export async function loadCredential(userId: string, platform: SocialPlatform): Promise<CredentialResult> {
  if (!userId) return { ok: false, reason: 'not_connected' };
  const row = await prisma.socialConnection.findFirst({ where: { userId, platform } });
  if (!row || row.status === 'revoked') return { ok: false, reason: 'not_connected' };
  if (row.status === 'expired') return { ok: false, reason: 'expired' };

  const needsRefresh = row.expiresAt !== null && row.expiresAt.getTime() <= Date.now() + REFRESH_SKEW_MS;
  if (!needsRefresh) {
    try {
      return { ok: true, credential: buildCredential(decryptKey(row.accessTokenEnc), row.platformUserId) };
    } catch {
      await markExpired(userId, platform);
      return { ok: false, reason: 'expired' };
    }
  }

  if (!row.refreshTokenEnc || !PLATFORM_CONFIG[platform].supportsRefresh) {
    await markExpired(userId, platform);
    return { ok: false, reason: 'expired' };
  }

  try {
    const tokens = await postTokenRequest(platform, {
      grant_type: 'refresh_token',
      refresh_token: decryptKey(row.refreshTokenEnc),
    });
    const res = await prisma.socialConnection.updateMany({
      where: { id: row.id, userId, refreshTokenEnc: row.refreshTokenEnc },
      data: {
        accessTokenEnc: encryptKey(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encryptKey(tokens.refreshToken) : row.refreshTokenEnc,
        expiresAt: tokens.expiresAt,
        status: 'active',
      },
    });
    if (res.count === 1) return { ok: true, credential: buildCredential(tokens.accessToken, row.platformUserId) };
  } catch {
    // Fall through: a concurrent refresh may have rotated the token. Re-read before giving up.
  }
  const again = await prisma.socialConnection.findFirst({ where: { id: row.id, userId } });
  if (again && again.status === 'active' && again.refreshTokenEnc !== row.refreshTokenEnc
      && again.expiresAt !== null && again.expiresAt.getTime() > Date.now() + REFRESH_SKEW_MS) {
    try {
      return { ok: true, credential: buildCredential(decryptKey(again.accessTokenEnc), again.platformUserId) };
    } catch { /* treated as expired below */ }
  }
  await markExpired(userId, platform);
  return { ok: false, reason: 'expired' };
}

const HTTP_TIMEOUT_MS = 10_000;

/** Best-effort revoke at the platform. Never throws and never logs the token. */
async function revokeAtPlatform(platform: SocialPlatform, accessToken: string): Promise<void> {
  const cfg = PLATFORM_CONFIG[platform];
  const id = process.env[cfg.clientIdEnv]?.trim();
  const secret = process.env[cfg.clientSecretEnv]?.trim();
  if (!cfg.revokeUrl || !id || !secret) return;
  try {
    await fetch(cfg.revokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ token: accessToken, token_type_hint: 'access_token' }),
      redirect: 'error',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    logger.warn('social token revoke failed', { platform });
  }
}

/** Delete this user's connection (tokens included). Also cancels their scheduled posts for the platform. */
export async function disconnect(userId: string, platform: SocialPlatform): Promise<{ deleted: boolean }> {
  if (!userId) throw new Error('social: userId is required');
  const row = await prisma.socialConnection.findFirst({ where: { userId, platform } });
  if (row) {
    try { await revokeAtPlatform(platform, decryptKey(row.accessTokenEnc)); } catch { /* best effort */ }
  }
  const res = await prisma.socialConnection.deleteMany({ where: { userId, platform } });
  const cancelled = await prisma.scheduledPost.updateMany({
    where: { userId, platform, status: 'scheduled' },
    data: { status: 'cancelled', error: 'disconnected' },
  });
  await recordActionSafe({
    userId,
    initiator: 'user',
    action: 'social_disconnected',
    tool: `social:${platform}`,
    permissionClass: 'A',
    status: 'VALIDATED',
    outputSummary: `disconnected ${platform}; ${res.count} connection(s) removed, ${cancelled.count} scheduled post(s) cancelled`,
  });
  return { deleted: res.count > 0 };
}

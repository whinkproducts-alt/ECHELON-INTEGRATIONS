/**
 * Social connection storage and credential loading. Every query is scoped by userId.
 * Tokens are decrypted only inside loadCredential, for one gateway call, and are
 * never returned by any list or status function.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordActionSafe } from '@/lib/ledger';
import { EncryptionNotConfiguredError, decryptKey, encryptKey } from '@/lib/key-encryption';
import { PLATFORM_CONFIG, SOCIAL_PLATFORMS, type SocialPlatform } from '@/lib/social/platforms';
import { postTokenRequest } from '@/lib/social/oauth';
import { deleteScheduledRowsForPlatform } from '@/lib/social/scheduled-store';

export interface ConnectionView {
  platform: SocialPlatform;
  status: 'not_connected' | 'connected' | 'expired';
  handle: string | null;
  connectedAt: string | null;
  scopes: string[];
}

/** Refresh this long before the stored expiry. */
const REFRESH_SKEW_MS = 60_000;
const REFRESH_REREAD_DELAY_MS = 150;

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
  | { ok: false; reason: 'not_connected' | 'expired' | 'encryption_not_configured' };

/** The platform account id stored for this user's connection, or null. No token is read. */
export async function getConnectedPlatformUserId(userId: string, platform: SocialPlatform): Promise<string | null> {
  if (!userId) return null;
  const row = await prisma.socialConnection.findFirst({
    where: { userId, platform, status: 'active' },
    select: { platformUserId: true },
  });
  return row?.platformUserId ?? null;
}

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
    } catch (e) {
      // A missing server key is a configuration fault, not an expired token: leave the row alone.
      if (e instanceof EncryptionNotConfiguredError) return { ok: false, reason: 'encryption_not_configured' };
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
  } catch (e) {
    if (e instanceof EncryptionNotConfiguredError) return { ok: false, reason: 'encryption_not_configured' };
    // Fall through: a concurrent refresh may have rotated the token. Re-read before giving up.
  }
  // Brief retry: a racing refresh may still be writing. Up to 3 re-reads, ~150 ms apart.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, REFRESH_REREAD_DELAY_MS));
    const again = await prisma.socialConnection.findFirst({ where: { id: row.id, userId } });
    if (!again || again.status === 'revoked') break;
    const rotated = again.accessTokenEnc !== row.accessTokenEnc || again.refreshTokenEnc !== row.refreshTokenEnc;
    // A null expiresAt after a refresh is valid (the platform gave no lifetime).
    const fresh = again.expiresAt === null || again.expiresAt.getTime() > Date.now() + REFRESH_SKEW_MS;
    if (again.status === 'active' && rotated && fresh) {
      try {
        return { ok: true, credential: buildCredential(decryptKey(again.accessTokenEnc), again.platformUserId) };
      } catch (e) {
        if (e instanceof EncryptionNotConfiguredError) return { ok: false, reason: 'encryption_not_configured' };
        break;
      }
    }
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
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams();
    if (cfg.clientAuth === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
      body.set('token', accessToken);
      body.set('token_type_hint', 'access_token');
    } else {
      // TikTok: client_key, client_secret and token in the form body.
      body.set(cfg.clientIdParam, id);
      body.set('client_secret', secret);
      body.set('token', accessToken);
    }
    await fetch(cfg.revokeUrl, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    logger.warn('social token revoke failed', { platform });
  }
}

/**
 * Delete this user's connection (tokens included) and DELETE their scheduled-post rows for the
 * platform (not just cancel: the approved post text must not outlive the connection). Ledgered.
 */
export async function disconnect(userId: string, platform: SocialPlatform): Promise<{ deleted: boolean }> {
  if (!userId) throw new Error('social: userId is required');
  const row = await prisma.socialConnection.findFirst({ where: { userId, platform } });
  if (row) {
    try { await revokeAtPlatform(platform, decryptKey(row.accessTokenEnc)); } catch { /* best effort */ }
  }
  const res = await prisma.socialConnection.deleteMany({ where: { userId, platform } });
  const removedScheduled = await deleteScheduledRowsForPlatform(userId, platform);
  await recordActionSafe({
    userId,
    initiator: 'user',
    action: 'social_disconnected',
    tool: `social:${platform}`,
    permissionClass: 'A',
    status: 'VALIDATED',
    outputSummary: `disconnected ${platform}; ${res.count} connection(s) removed, ${removedScheduled} scheduled post(s) deleted`,
  });
  return { deleted: res.count > 0 };
}

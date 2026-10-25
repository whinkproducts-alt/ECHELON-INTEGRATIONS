/**
 * OAuth 2.0 authorization-code flow with PKCE (S256) for the social platforms.
 *
 * - The state value is random, single-use, bound to the session user and the
 *   platform, and lives 10 minutes. Only its sha256 is stored.
 * - The PKCE verifier is stored encrypted (lib/key-encryption.ts).
 * - Tokens are encrypted before they touch the database and never logged,
 *   returned or put in the ledger.
 * - The redirect URI is built server-side and must be on the allow-list.
 */

import { createHash, randomBytes, randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordActionSafe } from '@/lib/ledger';
import { decryptKey, encryptKey, isEncryptionConfigured } from '@/lib/key-encryption';
import { cancelScheduledRowsForPlatform } from '@/lib/social/scheduled-store';
import {
  PLATFORM_CONFIG,
  STATE_TTL_MS,
  buildRedirectUri,
  clientCredentials,
  isRedirectAllowed,
  type SocialPlatform,
} from '@/lib/social/platforms';

const HTTP_TIMEOUT_MS = 10_000;

export function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
  return base64Url(randomBytes(32));
}

export function codeChallengeS256(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}

export function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export type StartResult =
  | { ok: true; authorizeUrl: string }
  | { ok: false; status: 400 | 503; error: 'platform_not_configured' | 'redirect_not_allowed' | 'encryption_not_configured' };

export async function startConnect(userId: string, platform: SocialPlatform): Promise<StartResult> {
  if (!userId) throw new Error('social: userId is required');
  if (!isEncryptionConfigured()) return { ok: false, status: 503, error: 'encryption_not_configured' };
  const creds = clientCredentials(platform);
  const redirectUri = buildRedirectUri(platform);
  if (!creds || !redirectUri) return { ok: false, status: 503, error: 'platform_not_configured' };
  if (!isRedirectAllowed(redirectUri)) return { ok: false, status: 400, error: 'redirect_not_allowed' };

  const cfg = PLATFORM_CONFIG[platform];
  const state = base64Url(randomBytes(32));
  const verifier = generateCodeVerifier();
  const now = new Date();

  // Housekeeping: this user's expired or used states for this platform.
  await prisma.oAuthState.deleteMany({
    where: { userId, platform, OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });
  await prisma.oAuthState.create({
    data: {
      userId,
      platform,
      stateHash: hashState(state),
      codeVerifierEnc: encryptKey(verifier),
      redirectUri,
      createdAt: now,
      expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    },
  });

  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set(cfg.clientIdParam, creds.id);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', cfg.scopes.join(cfg.scopeSeparator));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallengeS256(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return { ok: true, authorizeUrl: url.toString() };
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string;
}

/** POST to a platform token endpoint. Throws a fixed-message error: upstream bodies are never surfaced. */
export async function postTokenRequest(platform: SocialPlatform, form: Record<string, string>): Promise<TokenSet> {
  const cfg = PLATFORM_CONFIG[platform];
  const creds = clientCredentials(platform);
  if (!creds) throw new Error('token_request_failed');
  const body = new URLSearchParams(form);
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (cfg.clientAuth === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString('base64')}`;
  } else {
    body.set(cfg.clientIdParam, creds.id);
    body.set('client_secret', creds.secret);
  }
  let res: Response;
  try {
    res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    throw new Error('token_request_failed');
  }
  if (!res.ok) throw new Error('token_request_failed');
  let json: unknown;
  try { json = await res.json(); } catch { throw new Error('token_request_failed'); }
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  if (typeof j.access_token !== 'string' || !j.access_token) throw new Error('token_request_failed');
  const expiresIn = typeof j.expires_in === 'number' && j.expires_in > 0 ? j.expires_in : null;
  return {
    accessToken: j.access_token,
    refreshToken: typeof j.refresh_token === 'string' && j.refresh_token ? j.refresh_token : null,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    scopes: typeof j.scope === 'string' ? j.scope : '',
  };
}

/**
 * Look up the connected account's id and handle. For X this is required: null means the lookup
 * failed and the callback must fail without storing anything. Platforms without a lookup
 * (skeletons) return empty identity.
 */
async function lookupIdentity(platform: SocialPlatform, accessToken: string): Promise<{ id: string | null; handle: string | null } | null> {
  if (platform !== 'x') return { id: null, handle: null };
  try {
    const res = await fetch('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { id?: unknown; username?: unknown } };
    const id = typeof json.data?.id === 'string' && json.data.id ? json.data.id.slice(0, 40) : null;
    if (!id) return null;
    const handle = typeof json.data?.username === 'string' ? json.data.username.slice(0, 60) : null;
    return { id, handle };
  } catch {
    return null;
  }
}

export type CallbackErrorCode =
  | 'missing_params'
  | 'invalid_state'
  | 'redirect_not_allowed'
  | 'platform_not_configured'
  | 'exchange_failed'
  | 'denied'
  | 'identity_failed'
  | 'storage_failed';

export type CallbackResult = { ok: true } | { ok: false; error: CallbackErrorCode };

async function fail(userId: string, platform: SocialPlatform, error: CallbackErrorCode, correlationId?: string): Promise<CallbackResult> {
  await recordActionSafe({
    userId,
    initiator: 'user',
    persona: 'WHINK',
    action: 'social_connect_failed',
    tool: `social:${platform}`,
    permissionClass: 'A',
    status: 'FAILED',
    outputSummary: error,
    correlationId: correlationId ?? randomUUID(),
  });
  return { ok: false, error };
}

export async function completeCallback(
  userId: string,
  platform: SocialPlatform,
  params: { code?: string | null; state?: string | null; error?: string | null },
): Promise<CallbackResult> {
  if (!userId) throw new Error('social: userId is required');
  const correlationId = randomUUID();
  const { code, state } = params;
  if (!state || state.length > 200) return fail(userId, platform, 'missing_params', correlationId);

  // Single atomic claim: bound to this user and platform, unused, unexpired. Exactly one caller wins.
  const stateHash = hashState(state);
  const now = new Date();
  const claimed = await prisma.oAuthState.updateMany({
    where: { stateHash, userId, platform, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return fail(userId, platform, 'invalid_state', correlationId);
  const row = await prisma.oAuthState.findFirst({ where: { stateHash, userId, platform } });
  if (!row) return fail(userId, platform, 'invalid_state', correlationId);
  // Single use is already enforced by the claim above. Drop the row now so the encrypted PKCE
  // verifier does not outlive the one callback that needs it (row is held in memory).
  await prisma.oAuthState.deleteMany({ where: { id: row.id, userId } });

  if (params.error) return fail(userId, platform, 'denied', correlationId);
  if (!code || code.length > 2000) return fail(userId, platform, 'missing_params', correlationId);

  // The redirect URI must still be what the server would build now, and on the allow-list.
  const redirectUri = buildRedirectUri(platform);
  if (!redirectUri || redirectUri !== row.redirectUri || !isRedirectAllowed(redirectUri)) {
    return fail(userId, platform, 'redirect_not_allowed', correlationId);
  }
  if (!clientCredentials(platform)) return fail(userId, platform, 'platform_not_configured', correlationId);
  if (!isEncryptionConfigured()) return fail(userId, platform, 'storage_failed', correlationId);

  let tokens: TokenSet;
  try {
    tokens = await postTokenRequest(platform, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: decryptKey(row.codeVerifierEnc),
    });
  } catch {
    return fail(userId, platform, 'exchange_failed');
  }

  const identity = await lookupIdentity(platform, tokens.accessToken);
  // X: no verified identity, no connection. Nothing is stored.
  if (!identity) return fail(userId, platform, 'identity_failed');
  const scopes = tokens.scopes || PLATFORM_CONFIG[platform].scopes.join(' ');
  const data = {
    accessTokenEnc: encryptKey(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encryptKey(tokens.refreshToken) : null,
    scopes,
    expiresAt: tokens.expiresAt,
    platformUserId: identity.id,
    platformHandle: identity.handle,
    status: 'active',
  };
  try {
    const existing = await prisma.socialConnection.findFirst({
      where: { userId, platform },
      select: { platformUserId: true },
    });
    const accountChanged = Boolean(existing && existing.platformUserId !== identity.id);
    await prisma.socialConnection.upsert({
      where: { userId_platform: { userId, platform } },
      create: { userId, platform, ...data },
      update: data,
    });
    if (accountChanged) {
      // A different platform account is now connected: posts approved for the old one must not go out.
      await cancelScheduledRowsForPlatform(userId, platform, 'platform_account_changed');
    }
  } catch {
    logger.error('social connection store failed', { userId, platform });
    return fail(userId, platform, 'storage_failed');
  }

  await recordActionSafe({
    userId,
    initiator: 'user',
    action: 'social_connected',
    tool: `social:${platform}`,
    permissionClass: 'A',
    status: 'VALIDATED',
    outputSummary: `connected ${platform}${identity.handle ? ` as @${identity.handle}` : ''}`,
  });
  return { ok: true };
}

/** Remove expired and already-used OAuth states (all users). Run from the worker. Returns rows removed. */
export async function sweepOAuthStates(now: Date = new Date()): Promise<number> {
  const res = await prisma.oAuthState.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });
  return res.count;
}

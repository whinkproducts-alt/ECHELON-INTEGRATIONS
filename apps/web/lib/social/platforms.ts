/**
 * Social platform registry: OAuth endpoints, scopes and env-based client config.
 * Secrets come from environment variables only. Nothing here is logged.
 *
 * X is the implemented platform. Instagram and TikTok are skeletons pending
 * platform app review: their endpoints are best-effort and unverified against
 * the live platforms.
 */

export type SocialPlatform = 'x' | 'instagram' | 'tiktok';
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = ['x', 'instagram', 'tiktok'];

export function isSocialPlatform(v: unknown): v is SocialPlatform {
  return typeof v === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(v);
}

export interface PlatformConfig {
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl: string | null;
  scopes: string[];
  scopeSeparator: string;
  /** Name of the client id parameter on the authorize URL. */
  clientIdParam: 'client_id' | 'client_key';
  /** How the token endpoint expects client credentials. */
  clientAuth: 'basic' | 'body';
  supportsRefresh: boolean;
  clientIdEnv: string;
  clientSecretEnv: string;
}

export const PLATFORM_CONFIG: Record<SocialPlatform, PlatformConfig> = {
  x: {
    authorizeUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    revokeUrl: 'https://api.x.com/2/oauth2/revoke',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'follows.read', 'follows.write', 'dm.read', 'dm.write', 'offline.access'],
    scopeSeparator: ' ',
    clientIdParam: 'client_id',
    clientAuth: 'basic',
    supportsRefresh: true,
    clientIdEnv: 'X_CLIENT_ID',
    clientSecretEnv: 'X_CLIENT_SECRET',
  },
  instagram: {
    authorizeUrl: 'https://www.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    revokeUrl: null,
    scopes: ['instagram_business_basic', 'instagram_business_content_publish'],
    scopeSeparator: ',',
    clientIdParam: 'client_id',
    clientAuth: 'body',
    supportsRefresh: false,
    clientIdEnv: 'INSTAGRAM_CLIENT_ID',
    clientSecretEnv: 'INSTAGRAM_CLIENT_SECRET',
  },
  tiktok: {
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    // TikTok Login Kit revoke endpoint (POST form: client_key, client_secret, token). Best effort.
    revokeUrl: 'https://open.tiktokapis.com/v2/oauth/revoke/',
    scopes: ['user.info.basic', 'video.list', 'video.publish'],
    scopeSeparator: ',',
    clientIdParam: 'client_key',
    clientAuth: 'body',
    supportsRefresh: true,
    clientIdEnv: 'TIKTOK_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
  },
};

export function clientCredentials(platform: SocialPlatform): { id: string; secret: string } | null {
  const cfg = PLATFORM_CONFIG[platform];
  const id = process.env[cfg.clientIdEnv]?.trim();
  const secret = process.env[cfg.clientSecretEnv]?.trim();
  return id && secret ? { id, secret } : null;
}

export const STATE_TTL_MS = 10 * 60_000;

/** https anywhere; http only for a loopback host. Anything else is refused. */
function isAcceptableBase(u: URL): boolean {
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

/** Build the redirect URI server-side. Null when SOCIAL_OAUTH_REDIRECT_BASE is unset or not an acceptable URL. */
export function buildRedirectUri(platform: SocialPlatform): string | null {
  const base = process.env.SOCIAL_OAUTH_REDIRECT_BASE?.trim();
  if (!base) return null;
  try {
    const u = new URL(base);
    if (!isAcceptableBase(u)) return null;
    return `${u.origin}/api/social/${platform}/callback`;
  } catch {
    return null;
  }
}

/** Exact-match allow-list from SOCIAL_OAUTH_REDIRECT_ALLOWLIST. Empty list allows nothing. */
export function isRedirectAllowed(uri: string): boolean {
  const list = (process.env.SOCIAL_OAUTH_REDIRECT_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(uri);
}

/**
 * Location of the Connected Apps screen, for callback redirects. The origin is NEVER taken from the
 * request (Host header is attacker-influenced). It comes from SOCIAL_OAUTH_REDIRECT_BASE, then AUTH_URL,
 * then NEXTAUTH_URL, each only when acceptable (https, or http on localhost/127.0.0.1). When none is
 * usable the result is a relative path, which is a valid Location value. Params are fixed codes only.
 */
export function connectedAppsUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  const path = `/dashboard/settings/connected-apps?${qs}`;
  for (const raw of [process.env.SOCIAL_OAUTH_REDIRECT_BASE, process.env.AUTH_URL, process.env.NEXTAUTH_URL]) {
    const v = raw?.trim();
    if (!v) continue;
    try {
      const u = new URL(v);
      if (isAcceptableBase(u)) return `${u.origin}${path}`;
    } catch { /* try the next source */ }
  }
  return path;
}

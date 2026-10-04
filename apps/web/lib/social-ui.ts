// Pure helpers for the Connected Apps screen. No server imports.

export type SocialPlatform = 'x' | 'instagram' | 'tiktok';
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = ['x', 'instagram', 'tiktok'];

export type ConnectionStatus = 'not_connected' | 'connected' | 'expired';

export interface SocialConnectionView {
  platform: SocialPlatform;
  status: ConnectionStatus;
  handle: string | null;
  connectedAt: string | null;
  scopes: string[];
}

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  x: 'X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export const PLATFORM_NOTES: Record<SocialPlatform, string[]> = {
  x: [],
  instagram: ['Limited: pending platform app review'],
  tiktok: ['Limited: pending platform app review', 'Posting only — TikTok has no DM API'],
};

export function isSocialPlatform(v: unknown): v is SocialPlatform {
  return v === 'x' || v === 'instagram' || v === 'tiktok';
}

function isStatus(v: unknown): v is ConnectionStatus {
  return v === 'not_connected' || v === 'connected' || v === 'expired';
}

/** Defensive parse of GET /api/social/connections. Always returns one row per platform. */
export function parseConnections(body: unknown): SocialConnectionView[] {
  const raw: unknown[] =
    body && typeof body === 'object' && Array.isArray((body as { connections?: unknown }).connections)
      ? ((body as { connections: unknown[] }).connections)
      : [];
  return SOCIAL_PLATFORMS.map((platform) => {
    const found = raw.find(
      (r): r is Record<string, unknown> =>
        !!r && typeof r === 'object' && (r as Record<string, unknown>).platform === platform,
    );
    if (!found) {
      return { platform, status: 'not_connected', handle: null, connectedAt: null, scopes: [] };
    }
    const status = isStatus(found.status) ? found.status : 'not_connected';
    const scopes = Array.isArray(found.scopes)
      ? found.scopes.filter((s): s is string => typeof s === 'string').slice(0, 30)
      : [];
    return {
      platform,
      status,
      handle: typeof found.handle === 'string' ? found.handle : null,
      connectedAt: typeof found.connectedAt === 'string' ? found.connectedAt : null,
      scopes,
    };
  });
}

export function statusLabel(status: ConnectionStatus, handle: string | null): string {
  switch (status) {
    case 'connected': {
      if (!handle) return 'Connected';
      const h = handle.replace(/^@+/, '').slice(0, 40);
      return `Connected as @${h}`;
    }
    case 'expired':
      return 'Expired — reconnect';
    default:
      return 'Not connected';
  }
}

export function connectButtonLabel(status: ConnectionStatus): string {
  return status === 'expired' ? 'Reconnect' : 'Connect';
}

const ALLOWED_ORIGINS: Record<SocialPlatform, readonly string[]> = {
  x: ['https://x.com', 'https://twitter.com'],
  instagram: ['https://www.instagram.com', 'https://api.instagram.com', 'https://facebook.com', 'https://www.facebook.com'],
  tiktok: ['https://www.tiktok.com'],
};

/** Returns the normalised URL if it is https and on the platform's allow-listed origin, else null. */
export function validateAuthorizeUrl(platform: SocialPlatform, value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (!ALLOWED_ORIGINS[platform].includes(u.origin)) return null;
  return u.toString();
}

export const DAILY_LIMITS_NOTE =
  'Daily limits apply to posts, replies, messages and follows to protect your account.';

/** Exact wording of what a connection allows, shown before the user may continue. */
export function consentText(platform: SocialPlatform, productName: string): string[] {
  switch (platform) {
    case 'x':
      return [
        `${productName} can read your timeline, mentions and direct messages, and can post, reply, send direct messages, follow, unfollow and delete posts for you. Every action that changes something waits for your approval. What it reads is sent to an AI model provider and may be processed outside Canada, and includes other people's messages. You are responsible for having the right to message people. Disconnect at any time to delete the stored access.`,
      ];
    case 'instagram':
      return [
        `${productName} can post to your Instagram account for you. Every action that changes something waits for your approval. This requires an Instagram Business or Creator account. Disconnect at any time to delete the stored access.`,
      ];
    default:
      return [
        `${productName} can publish posts to your TikTok account for you. This is posting only. Every action that changes something waits for your approval. Posts may be private until the platform audit completes. Disconnect at any time to delete the stored access.`,
      ];
  }
}

const ERROR_TEXT: Record<string, string> = {
  access_denied: 'You declined the connection, so nothing was linked.',
  denied: 'You declined the connection, so nothing was linked.',
  exchange_failed: 'The platform did not accept the sign-in. Please try again.',
  missing_params: 'The platform sent back an incomplete response. Please try connecting again.',
  storage_failed: 'We could not save the connection securely. Please try again.',
  identity_failed: 'We could not confirm which account you signed in with. Please try again.',
  encryption_not_configured: "Secure storage isn't configured on this server yet.",
  invalid_state: 'That sign-in link expired or was already used. Please try connecting again.',
  state_expired: 'That sign-in link expired. Please try connecting again.',
  token_exchange_failed: 'The platform did not accept the sign-in. Please try again.',
  platform_not_configured: 'Not configured by the operator yet',
  redirect_not_allowed: 'The connection could not be completed because the redirect is not allowed.',
  unknown_platform: 'That platform is not supported.',
  server_error: 'Something went wrong on our side. Please try again.',
};

export function errorMessage(code: string | null | undefined): string {
  if (!code) return ERROR_TEXT.server_error;
  const key = code.slice(0, 64);
  return Object.prototype.hasOwnProperty.call(ERROR_TEXT, key)
    ? ERROR_TEXT[key]
    : 'The connection could not be completed. Please try again.';
}

export type CallbackNotice =
  | { kind: 'connected'; text: string }
  | { kind: 'error'; text: string }
  | null;

/** Plain-text notice from ?connected / ?error. Unknown values never echo into the message. */
export function noticeFromQuery(connected: string | null, error: string | null): CallbackNotice {
  if (error) return { kind: 'error', text: errorMessage(error) };
  if (connected && isSocialPlatform(connected)) {
    return { kind: 'connected', text: `${PLATFORM_LABELS[connected]} connected.` };
  }
  return null;
}

export type ConnectOutcome =
  | { ok: true; url: string }
  | { ok: false; message: string };

/** Interpret the connect POST response. */
export function interpretConnectResponse(
  platform: SocialPlatform,
  status: number,
  body: unknown,
): ConnectOutcome {
  const errCode =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : null;
  if (status === 503 && (errCode === 'platform_not_configured' || errCode === 'encryption_not_configured')) {
    return { ok: false, message: ERROR_TEXT[errCode] };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, message: errorMessage(errCode) };
  }
  const url = validateAuthorizeUrl(
    platform,
    body && typeof body === 'object' ? (body as { authorizeUrl?: unknown }).authorizeUrl : undefined,
  );
  if (!url) return { ok: false, message: 'Refused: the sign-in address was not a trusted one.' };
  return { ok: true, url };
}

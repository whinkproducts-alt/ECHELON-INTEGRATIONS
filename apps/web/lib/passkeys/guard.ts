import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { checkCsrf } from '@/lib/csrf';
import { clientKey, limitOr429 } from '@/lib/rate-limit';
import { writeLedger } from '@/lib/ledger';
import { logger } from '@/lib/logger';
import { getWebAuthnConfig, PasskeyConfigError, type WebAuthnConfig } from './config';

/**
 * lib/csrf.ts deliberately skips /api/auth/** (NextAuth's own routes). Our passkey routes live
 * there but are ordinary JSON APIs, so we apply the same rule here under a non-exempt path.
 */
export function passkeyCsrf(req: Request): NextResponse | null {
  const url = new URL(req.url);
  const r = checkCsrf({
    method: req.method,
    pathname: '/api/passkey',
    secFetchSite: req.headers.get('sec-fetch-site'),
    origin: req.headers.get('origin'),
    host: req.headers.get('x-forwarded-host') ?? req.headers.get('host'),
    proto: req.headers.get('x-forwarded-proto'),
    requestOrigin: url.origin,
    configuredUrl: process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? null,
  });
  return r.ok ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/** Per-user bucket when signed in, else per client address (or the shared route bucket). */
export async function passkeyLimit(req: Request, userId?: string | null): Promise<NextResponse | null> {
  const subject = userId ? `u:${userId}` : `a:${clientKey(req.headers) ?? 'route'}`;
  const limited = await limitOr429('passkey', subject);
  return limited ? new NextResponse(limited.body, { status: 429, headers: limited.headers }) : null;
}

/** Client key for cap buckets: trusted address or the shared route bucket. */
export function challengeBucket(req: Request): string {
  return `a:${clientKey(req.headers) ?? 'route'}`;
}

export function loadConfig(): { cfg: WebAuthnConfig } | { response: NextResponse } {
  try {
    return { cfg: getWebAuthnConfig() };
  } catch (e) {
    if (e instanceof PasskeyConfigError) logger.warn('passkeys unavailable', { reason: e.message });
    return { response: NextResponse.json({ error: 'Passkeys are not available' }, { status: 503 }) };
  }
}

export async function ledgerPasskey(
  userId: string,
  action: string,
  status: 'EXECUTED' | 'FAILED' | 'DENIED',
  detail: Record<string, unknown> = {},
): Promise<void> {
  await writeLedger({
    userId,
    action,
    permissionClass: 'A',
    status,
    initiator: 'user',
    persona: 'WHINK',
    correlationId: randomUUID(),
    metadata: detail, // ids and reasons only: never challenges, keys or signatures
  });
}

/** Security event (SECURITY_EVENT: prefix, as read by countSecurityEvents). Unknown user: log only. */
export async function passkeySecurityEvent(
  userId: string | null,
  event: string,
  detail: Record<string, unknown> = {},
  status: 'EXECUTED' | 'DENIED' = 'DENIED',
): Promise<void> {
  logger.security('passkey security event', { event, userId: userId ?? undefined });
  if (!userId) return;
  await ledgerPasskey(userId, `SECURITY_EVENT:${event}`, status, detail);
}

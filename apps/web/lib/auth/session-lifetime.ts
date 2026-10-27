/**
 * Per-token absolute session lifetime ("remember me").
 *
 * Auth.js re-signs the JWT with a fresh `exp` on every session read (sliding), so the library
 * expiry cannot enforce an absolute limit. We stamp `authAt` (epoch seconds) once at sign-in and
 * check it on every read. A token past its limit, or without any usable issue time, is dead.
 */

export const SESSION_TTL_SHORT_SECONDS = 12 * 60 * 60;
export const SESSION_TTL_REMEMBER_SECONDS = 30 * 24 * 60 * 60;

export interface LifetimeToken {
  remember?: boolean;
  authAt?: number;
  iat?: number;
  [key: string]: unknown;
}

export function sessionTtlSeconds(remember: boolean): number {
  return remember ? SESSION_TTL_REMEMBER_SECONDS : SESSION_TTL_SHORT_SECONDS;
}

/** Interpret the form/JSON `remember` value strictly: only true or "true" remembers. */
export function parseRemember(v: unknown): boolean {
  return v === true || v === 'true';
}

/**
 * Apply the lifetime rules. `signedIn` is true on the sign-in call (a user object is present).
 * Returns the token to keep, or null when the session has expired.
 */
export function applyLifetime<T extends LifetimeToken>(
  token: T,
  signedIn: { remember: boolean } | null,
  nowMs: number = Date.now(),
): T | null {
  const now = Math.floor(nowMs / 1000);
  if (signedIn) {
    return { ...token, remember: signedIn.remember, authAt: now };
  }
  const start = typeof token.authAt === 'number' ? token.authAt : typeof token.iat === 'number' ? token.iat : null;
  if (start === null) return null; // no issue time: fail closed
  const ttl = sessionTtlSeconds(token.remember === true);
  if (now >= start + ttl) return null;
  return token.authAt === undefined ? { ...token, authAt: start, remember: false } : token;
}

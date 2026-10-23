/**
 * HMAC-SHA256 request signing for gestures.
 *
 * Key model: the server never stores per-session keys. A key is derived on demand:
 *   key = HMAC-SHA256(GESTURE_HMAC_SECRET, "whink-gesture-v1|" + userId + "|" + sessionId)
 * sessionId = "<expiryEpochSec>.<random hex>". Expiry is part of the derivation input, so a
 * client cannot extend it without breaking its own signature. A key is bound to one user.
 *
 * The signature covers the raw request body bytes (no canonicalisation to get wrong).
 * Header: x-gesture-signature: v1=<hex>
 *
 * What this does: stops tampering, forgery and cross-user replay for anyone without a key.
 * What it does not do: protect against script running in the page that already holds the key.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const KEY_TTL_SEC = 3600;
export const MAX_SKEW_MS = 2000;
export const NONCE_TTL_MS = 10_000;
const SIG_RE = /^v1=([0-9a-f]{64})$/;
const SESSION_RE = /^(\d{10})\.([0-9a-f]{32})$/;

export class GestureSecretNotConfiguredError extends Error {
  constructor() {
    super('gesture_hmac_not_configured');
    this.name = 'GestureSecretNotConfiguredError';
  }
}

function secret(): Buffer {
  const raw = (process.env.GESTURE_HMAC_SECRET ?? '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new GestureSecretNotConfiguredError();
  return Buffer.from(raw, 'hex');
}

export function isGestureHmacConfigured(): boolean {
  return /^[0-9a-fA-F]{64}$/.test((process.env.GESTURE_HMAC_SECRET ?? '').trim());
}

export function deriveKey(userId: string, sessionId: string): Buffer {
  return createHmac('sha256', secret()).update(`whink-gesture-v1|${userId}|${sessionId}`).digest();
}

export function issueSession(userId: string, nowMs: number = Date.now()): { sessionId: string; key: string; expiresAt: number } {
  const exp = Math.floor(nowMs / 1000) + KEY_TTL_SEC;
  const sessionId = `${exp}.${randomBytes(16).toString('hex')}`;
  return { sessionId, key: deriveKey(userId, sessionId).toString('hex'), expiresAt: exp * 1000 };
}

export function sign(key: Buffer, rawBody: string): string {
  return `v1=${createHmac('sha256', key).update(rawBody, 'utf8').digest('hex')}`;
}

export type VerifyFailure = 'bad_header' | 'bad_session' | 'session_expired' | 'bad_signature';

/** Constant time verify. Never throws on bad input; throws only when the server secret is missing. */
export function verify(
  userId: string,
  sessionId: unknown,
  signatureHeader: string | null,
  rawBody: string,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; reason: VerifyFailure } {
  const m = signatureHeader ? SIG_RE.exec(signatureHeader) : null;
  if (!m) return { ok: false, reason: 'bad_header' };
  const sm = typeof sessionId === 'string' ? SESSION_RE.exec(sessionId) : null;
  if (!sm) return { ok: false, reason: 'bad_session' };
  if (Number(sm[1]) * 1000 < nowMs) return { ok: false, reason: 'session_expired' };
  const expected = Buffer.from(sign(deriveKey(userId, sessionId as string), rawBody).slice(3), 'hex');
  const got = Buffer.from(m[1], 'hex');
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, reason: 'bad_signature' };
  return { ok: true };
}

// ── Replay protection ──────────────────────────────────────────────────────────

const seen = new Map<string, number>();
const MAX_SEEN = 10_000;

/**
 * Returns true the first time a (user, nonce) is seen inside the window, false on replay.
 * In memory: correct for one server process. A multi instance deployment needs a shared store.
 */
export function claimNonce(userId: string, nonce: string, nowMs: number = Date.now()): boolean {
  if (seen.size > 1000) {
    for (const [k, exp] of seen) if (exp <= nowMs) seen.delete(k);
  }
  const key = `${userId}:${nonce}`;
  const exp = seen.get(key);
  if (exp !== undefined && exp > nowMs) return false;
  if (seen.size >= MAX_SEEN) return false; // fail closed under flood
  seen.set(key, nowMs + NONCE_TTL_MS);
  return true;
}

export function _resetNoncesForTest(): void {
  seen.clear();
}

/**
 * Server-side confirmation code for spoken approvals.
 *
 * The 4-digit code is derived from a server secret, the owner's user id, the approval id and the
 * approval's content hash, so it changes per request and per content. The card shows it; a voice
 * approval must repeat it and the decision route checks it here. Deny needs no code.
 * Without a configured secret there is no code, and a voice approval is refused (fail closed).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(): string | null {
  const s = (process.env.APPROVAL_CODE_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').trim();
  return s.length >= 16 ? s : null;
}

export function approvalConfirmationCode(userId: string, approvalId: string, contentHash: string): string | null {
  const key = secret();
  if (!key || !userId || !approvalId || !contentHash) return null;
  const mac = createHmac('sha256', key).update(`approval-code:${userId}:${approvalId}:${contentHash}`).digest();
  const limit = 4294967296 - (4294967296 % 10000); // rejection sampling over 4-byte windows, no modulo bias
  for (let i = 0; i + 4 <= mac.length; i += 4) {
    const n = mac.readUInt32BE(i);
    if (n < limit) return String(n % 10000).padStart(4, '0');
  }
  return '0000';
}

export function verifyConfirmationCode(expected: string | null, given: unknown): boolean {
  if (!expected || typeof given !== 'string' || !/^\d{4}$/.test(given)) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

/**
 * AES-256-GCM key encryption for user-supplied API keys.
 * The server encryption key comes from ENCRYPTION_KEY env var (32-byte hex string).
 * Never expose the plaintext key outside this module.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/** Thrown when ENCRYPTION_KEY is unset or is not exactly 64 hex characters. There is no fallback key. */
export class EncryptionNotConfiguredError extends Error {
  constructor() {
    super('encryption_not_configured');
    this.name = 'EncryptionNotConfiguredError';
  }
}

const HEX_KEY_RE = /^[0-9a-fA-F]{64}$/;

/** True when ENCRYPTION_KEY is a valid 64-hex (32 byte) key. Never returns or logs the key. */
export function isEncryptionConfigured(): boolean {
  return HEX_KEY_RE.test((process.env.ENCRYPTION_KEY ?? '').trim());
}

function getEncryptionKey(): Buffer {
  const raw = (process.env.ENCRYPTION_KEY ?? '').trim();
  if (!HEX_KEY_RE.test(raw)) throw new EncryptionNotConfiguredError();
  return Buffer.from(raw, 'hex');
}

/**
 * Encrypt a plaintext API key. Returns a hex-encoded string containing
 * iv (12 bytes) + authTag (16 bytes) + ciphertext, all concatenated.
 */
export function encryptKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('hex');
}

/**
 * Decrypt a hex-encoded encrypted key back to plaintext.
 */
export function decryptKey(hexEncrypted: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(hexEncrypted, 'hex');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Returns the last 4 visible characters of the key for UI display. */
export function keyHint(plaintext: string): string {
  return plaintext.slice(-4);
}

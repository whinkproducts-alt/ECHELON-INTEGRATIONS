/**
 * AES-256-GCM key encryption for user-supplied API keys.
 * The server encryption key comes from ENCRYPTION_KEY env var (32-byte hex string).
 * Never expose the plaintext key outside this module.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX_LENGTH = 64; // 32 bytes = 64 hex chars

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? '';
  if (raw.length < KEY_HEX_LENGTH) {
    // In development, derive a fixed key from a constant. Warn loudly.
    if (process.env.NODE_ENV !== 'production') {
      const devKey = 'deadbeef'.repeat(8); // 64 hex chars
      return Buffer.from(devKey, 'hex');
    }
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes) in production');
  }
  return Buffer.from(raw.slice(0, KEY_HEX_LENGTH), 'hex');
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

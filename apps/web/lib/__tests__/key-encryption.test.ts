/**
 * Tests for lib/key-encryption.ts
 *
 * Covers: round-trip encrypt/decrypt, keyHint, bad ciphertext, dev key fallback.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Use a known 32-byte hex key for deterministic testing
const TEST_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

describe('key-encryption', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = originalKey;
    }
  });

  it('round-trips: decrypt(encrypt(x)) === x', async () => {
    const { encryptKey, decryptKey } = await import('../key-encryption');
    const plaintext = 'sk-ant-api03-supersecretkey1234567890abcdef';
    const cipher = encryptKey(plaintext);
    expect(decryptKey(cipher)).toBe(plaintext);
  });

  it('produces different ciphertext on each call (random IV)', async () => {
    const { encryptKey } = await import('../key-encryption');
    const plaintext = 'sk-ant-api03-test';
    const c1 = encryptKey(plaintext);
    const c2 = encryptKey(plaintext);
    expect(c1).not.toBe(c2);
  });

  it('ciphertext is a non-empty hex string', async () => {
    const { encryptKey } = await import('../key-encryption');
    const cipher = encryptKey('sk-ant-api03-test');
    expect(cipher).toMatch(/^[0-9a-f]+$/);
    // Must include at least IV (12B) + authTag (16B) + 1 byte content = 58 hex chars
    expect(cipher.length).toBeGreaterThanOrEqual(58);
  });

  it('keyHint returns the last 4 characters of the plaintext key', async () => {
    const { keyHint } = await import('../key-encryption');
    expect(keyHint('sk-ant-api03-abcdefghijklmno1234')).toBe('1234');
    expect(keyHint('sk-openai-key-XYZ9')).toBe('XYZ9');
  });

  it('throws on tampered ciphertext (authTag verification fails)', async () => {
    const { encryptKey, decryptKey } = await import('../key-encryption');
    const cipher = encryptKey('sk-ant-api03-test');
    // Flip the last byte
    const tampered = cipher.slice(0, -2) + ((parseInt(cipher.slice(-2), 16) ^ 0xff).toString(16).padStart(2, '0'));
    expect(() => decryptKey(tampered)).toThrow();
  });

  it('throws EncryptionNotConfiguredError when ENCRYPTION_KEY is unset (no dev fallback)', async () => {
    delete process.env.ENCRYPTION_KEY;
    const { encryptKey, decryptKey, EncryptionNotConfiguredError, isEncryptionConfigured } = await import('../key-encryption');
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptKey('sk-ant-api03-devtest')).toThrow(EncryptionNotConfiguredError);
    expect(() => decryptKey('00'.repeat(40))).toThrow(EncryptionNotConfiguredError);
  });

  it('rejects a key that is too short, non-hex, or the old dev constant length mismatch', async () => {
    const { encryptKey, EncryptionNotConfiguredError } = await import('../key-encryption');
    for (const bad of ['abc', 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
      process.env.ENCRYPTION_KEY = bad;
      expect(() => encryptKey('x')).toThrow(EncryptionNotConfiguredError);
    }
  });

  it('a ciphertext made with the old dev fallback key cannot be decrypted by a real key', async () => {
    const { decryptKey } = await import('../key-encryption');
    // Encrypt manually with the former fallback key to prove it is no longer special.
    const { createCipheriv, randomBytes } = await import('crypto');
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', Buffer.from('deadbeef'.repeat(8), 'hex'), iv);
    const enc = Buffer.concat([c.update('secret', 'utf8'), c.final()]);
    const blob = Buffer.concat([iv, c.getAuthTag(), enc]).toString('hex');
    expect(() => decryptKey(blob)).toThrow();
  });
});

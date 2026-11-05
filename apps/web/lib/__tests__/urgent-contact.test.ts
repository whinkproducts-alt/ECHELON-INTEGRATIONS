import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const KEY = 'a'.repeat(64);

describe('phone helpers', () => {
  it('normalises common formats to E.164', async () => {
    const { normalizePhone } = await import('@/lib/phone');
    expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567');
    expect(normalizePhone(' +44 20 7946 0958 ')).toBe('+442079460958');
    expect(normalizePhone('0015551234567')).toBe('+15551234567');
  });

  it('rejects numbers that cannot be dialled internationally', async () => {
    const { normalizePhone } = await import('@/lib/phone');
    expect(normalizePhone('5551234567')).toBeNull(); // no country code
    expect(normalizePhone('+0123456789')).toBeNull(); // leading zero
    expect(normalizePhone('+1 555 CALL NOW')).toBeNull();
    expect(normalizePhone('+123')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it('masks everything but the country code and last four digits', async () => {
    const { maskPhone } = await import('@/lib/phone');
    expect(maskPhone('+15551234567')).toBe('+1 •••• 4567');
    expect(maskPhone('+442079460958')).toBe('+44 •••• 0958');
  });

  it('keeps only known channels, de-duplicated and in canonical order', async () => {
    const { parseChannels } = await import('@/lib/phone');
    expect(parseChannels(['whatsapp', 'sms', 'sms', 'pager'])).toEqual(['sms', 'whatsapp']);
    expect(parseChannels('call')).toEqual(['call']);
    expect(parseChannels(undefined)).toEqual([]);
  });
});

describe('urgent contact store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('ENCRYPTION_KEY', KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@/lib/db');
  });

  it('encrypts before writing and never stores the plaintext number', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    vi.doMock('@/lib/db', () => ({ prisma: { userProfile: { upsert } } }));
    const { saveUrgentContact } = await import('@/lib/urgent-contact');
    await saveUrgentContact('u1', { phone: '+1 555 123 4567', channels: ['sms'] });

    const data = upsert.mock.calls[0][0];
    expect(data.where).toEqual({ userId: 'u1' });
    expect(data.create.urgentChannels).toEqual(['sms']);
    expect(data.create.urgentPhoneE164Enc).not.toContain('5551234567');
    expect(data.create.urgentPhoneE164Enc).toMatch(/^[0-9a-f]+$/);
    expect(data.update).toEqual({ urgentPhoneE164Enc: data.create.urgentPhoneE164Enc, urgentChannels: ['sms'] });
  });

  it('defaults to all three channels when a number is given without one', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    vi.doMock('@/lib/db', () => ({ prisma: { userProfile: { upsert } } }));
    const { saveUrgentContact } = await import('@/lib/urgent-contact');
    await saveUrgentContact('u1', { phone: '+15551234567', channels: [] });
    expect(upsert.mock.calls[0][0].create.urgentChannels).toEqual(['call', 'sms', 'whatsapp']);
  });

  it('refuses to store anything when ENCRYPTION_KEY is missing', async () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    const upsert = vi.fn();
    vi.doMock('@/lib/db', () => ({ prisma: { userProfile: { upsert } } }));
    const { saveUrgentContact, UrgentContactError } = await import('@/lib/urgent-contact');
    await expect(saveUrgentContact('u1', { phone: '+15551234567' })).rejects.toMatchObject({ code: 'encryption_unavailable' });
    expect(upsert).not.toHaveBeenCalled();
    expect(UrgentContactError).toBeTypeOf('function');
  });

  it('round-trips: decrypts for delivery, masks for display', async () => {
    const { encryptKey } = await import('@/lib/key-encryption');
    const enc = encryptKey('+15551234567');
    const findUnique = vi.fn().mockResolvedValue({ urgentPhoneE164Enc: enc, urgentChannels: ['call', 'whatsapp'] });
    vi.doMock('@/lib/db', () => ({ prisma: { userProfile: { findUnique } } }));
    const { decryptUrgentPhone, getUrgentContact } = await import('@/lib/urgent-contact');

    expect(await decryptUrgentPhone('u1')).toEqual({ phone: '+15551234567', channels: ['call', 'whatsapp'] });
    expect(await getUrgentContact('u1')).toEqual({ maskedPhone: '+1 •••• 4567', channels: ['call', 'whatsapp'] });
  });

  it('returns null instead of throwing when the ciphertext cannot be opened', async () => {
    const findUnique = vi.fn().mockResolvedValue({ urgentPhoneE164Enc: 'deadbeef', urgentChannels: ['sms'] });
    vi.doMock('@/lib/db', () => ({ prisma: { userProfile: { findUnique } } }));
    const { decryptUrgentPhone, getUrgentContact } = await import('@/lib/urgent-contact');
    expect(await decryptUrgentPhone('u1')).toBeNull();
    expect(await getUrgentContact('u1')).toBeNull();
  });
});

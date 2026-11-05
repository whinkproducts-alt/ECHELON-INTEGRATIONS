/**
 * Urgent contact store — the Founder's phone plus the channels WHINK, MAMBA and the
 * Board may use when something cannot wait. The number is stored AES-256-GCM encrypted
 * (lib/key-encryption.ts, ENCRYPTION_KEY). Nothing here logs plaintext.
 *
 * Pure helpers live in lib/phone.ts so the signup form can import them without pulling
 * Prisma or the key into the client bundle.
 */

import { prisma } from '@/lib/db';
import { decryptKey, encryptKey, isEncryptionConfigured } from '@/lib/key-encryption';
import {
  DEFAULT_URGENT_CHANNELS,
  normalizePhone,
  maskPhone,
  parseChannels,
  type UrgentChannel,
} from '@/lib/phone';

export {
  URGENT_CHANNELS,
  URGENT_CHANNEL_LABELS,
  DEFAULT_URGENT_CHANNELS,
  isUrgentChannel,
  normalizePhone,
  maskPhone,
  parseChannels,
  type UrgentChannel,
} from '@/lib/phone';

export class UrgentContactError extends Error {
  constructor(public code: 'invalid_phone' | 'encryption_unavailable', message: string) {
    super(message);
    this.name = 'UrgentContactError';
  }
}

export type UrgentContactInput = { phone: string; channels?: unknown };

/** Validate and encrypt an input pair without touching the database. */
export function prepareUrgentContact({ phone, channels }: UrgentContactInput): { enc: string; channels: UrgentChannel[] } {
  const e164 = normalizePhone(phone);
  if (!e164) {
    throw new UrgentContactError('invalid_phone', 'Enter a phone number in international format, for example +1 555 123 4567.');
  }
  const list = parseChannels(channels);
  const chosen = list.length > 0 ? list : DEFAULT_URGENT_CHANNELS;
  if (!isEncryptionConfigured()) {
    throw new UrgentContactError('encryption_unavailable', 'Urgent contact is unavailable on this server (ENCRYPTION_KEY is not configured).');
  }
  return { enc: encryptKey(e164), channels: chosen };
}

/** Store the encrypted number and channel list on the user's profile. */
export async function saveUrgentContact(userId: string, input: UrgentContactInput): Promise<void> {
  const { enc, channels } = prepareUrgentContact(input);
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, urgentPhoneE164Enc: enc, urgentChannels: channels },
    update: { urgentPhoneE164Enc: enc, urgentChannels: channels },
  });
}

/** Remove the number and channels (urgent issues then stay in the dashboard). */
export async function clearUrgentContact(userId: string): Promise<void> {
  await prisma.userProfile.update({
    where: { userId },
    data: { urgentPhoneE164Enc: null, urgentChannels: [] },
  });
}

export type UrgentContactView = { maskedPhone: string; channels: UrgentChannel[] };

/** Safe view for the UI: no ciphertext, no plaintext. */
export async function getUrgentContact(userId: string): Promise<UrgentContactView | null> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { urgentPhoneE164Enc: true, urgentChannels: true },
  });
  if (!profile?.urgentPhoneE164Enc) return null;
  let plain: string;
  try {
    plain = decryptKey(profile.urgentPhoneE164Enc);
  } catch {
    return null;
  }
  return { maskedPhone: maskPhone(plain), channels: parseChannels(profile.urgentChannels) };
}

/**
 * Plaintext number for the delivery path only. Returns null when absent or undecryptable
 * (for example after an ENCRYPTION_KEY rotation) — callers must fall back to the dashboard.
 */
export async function decryptUrgentPhone(userId: string): Promise<{ phone: string; channels: UrgentChannel[] } | null> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { urgentPhoneE164Enc: true, urgentChannels: true },
  });
  if (!profile?.urgentPhoneE164Enc) return null;
  try {
    return { phone: decryptKey(profile.urgentPhoneE164Enc), channels: parseChannels(profile.urgentChannels) };
  } catch {
    return null;
  }
}

/**
 * Pure phone/channel helpers shared by the signup form (client) and the urgent-contact
 * store (server). No database, no encryption, no env access — safe to import anywhere.
 */

export const URGENT_CHANNELS = ['call', 'sms', 'whatsapp'] as const;
export type UrgentChannel = (typeof URGENT_CHANNELS)[number];

/** Labels used on the signup form and in settings. */
export const URGENT_CHANNEL_LABELS: Record<UrgentChannel, string> = {
  call: 'Phone call',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

/** Fallback when a number is given and no channel is chosen: all three. */
export const DEFAULT_URGENT_CHANNELS: UrgentChannel[] = ['call', 'sms', 'whatsapp'];

export function isUrgentChannel(value: unknown): value is UrgentChannel {
  return typeof value === 'string' && (URGENT_CHANNELS as readonly string[]).includes(value);
}

/**
 * Normalise to E.164 (`+` then 1–15 digits, first digit 1–9). Accepts spaces, dashes,
 * dots, parentheses and a leading `00` international prefix. Returns null when the input
 * cannot be a real subscriber number (too short, letters, no country code).
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/[\s().-]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) return null;
  if (!/^\+[1-9]\d{6,14}$/.test(s)) return null;
  return s;
}

/** Display form that keeps the country code and last four digits: `+1 •••• 4567`. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  const country = digits.slice(0, Math.max(1, digits.length - 10));
  return `+${country} •••• ${last4}`;
}

/** Canonical, de-duplicated channel list from untrusted input. Unknown values are dropped. */
export function parseChannels(input: unknown): UrgentChannel[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? [input] : [];
  const picked = new Set<UrgentChannel>();
  for (const value of raw) {
    if (!isUrgentChannel(value)) continue;
    picked.add(value);
  }
  return URGENT_CHANNELS.filter((c) => picked.has(c));
}

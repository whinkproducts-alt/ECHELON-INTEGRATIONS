// Shapes returned by /api/contacts and the comms routes. Everything here is data from the server or a
// user-supplied file: render it as text only, never as HTML.
export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: string[];
  source: string;
  notes: string | null;
  createdAt: string;
}

export type Channel = 'SMS' | 'WHATSAPP' | 'TELEGRAM' | 'EMAIL' | 'PHONE_CALL';

export const CHANNEL_LABEL: Record<Channel, string> = {
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram',
  EMAIL: 'Email',
  PHONE_CALL: 'Call',
};

export const BODY_MAX = 1600;
export const SCRIPT_MAX = 2000;

export interface ImportResult { parsed: number; imported: number; duplicates: number }

export function isContact(v: unknown): v is Contact {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.name === 'string' && Array.isArray(o.tags);
}

export function normalizeContact(v: unknown): Contact | null {
  if (!isContact(v)) return null;
  const o = v as unknown as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === 'string' ? x : null);
  return {
    id: v.id,
    name: v.name,
    email: s(o.email),
    phone: s(o.phone),
    company: s(o.company),
    tags: v.tags.filter((t): t is string => typeof t === 'string'),
    source: s(o.source) ?? 'manual',
    notes: s(o.notes),
    createdAt: s(o.createdAt) ?? '',
  };
}

/** Telegram has no number: a contact reaches it through a `telegram:<chatId>` tag. */
export function hasTelegram(c: Pick<Contact, 'tags'>): boolean {
  return c.tags.some((t) => /^telegram:-?\d{1,20}$/.test(t));
}

export function channelAvailable(c: Contact, ch: Channel): { ok: boolean; why?: string } {
  switch (ch) {
    case 'SMS':
    case 'WHATSAPP':
    case 'PHONE_CALL':
      return c.phone ? { ok: true } : { ok: false, why: 'No phone number on file' };
    case 'EMAIL':
      return c.email ? { ok: true } : { ok: false, why: 'No email address on file' };
    case 'TELEGRAM':
      return hasTelegram(c) ? { ok: true } : { ok: false, why: 'Needs a telegram:<chat id> tag' };
  }
}

export function matchesQuery(c: Contact, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [c.name, c.email, c.phone, c.company, c.source, ...c.tags]
    .some((f) => typeof f === 'string' && f.toLowerCase().includes(needle));
}

export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const d = (await res.json()) as { error?: unknown };
    return typeof d.error === 'string' ? d.error : fallback;
  } catch {
    return fallback;
  }
}

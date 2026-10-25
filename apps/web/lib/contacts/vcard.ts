/**
 * Small vCard 3.0/4.0 parser (no dependency). macOS Contacts exports vCards.
 * Safe by construction: size and card caps, content check, field caps, no code paths that
 * fetch URLs (PHOTO and URL properties are ignored). Output is plain data.
 */

export const VCARD_MAX_BYTES = 2 * 1024 * 1024;
export const VCARD_MAX_CARDS = 5000;

export interface ParsedContact {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  tags: string[];
}

export class VCardError extends Error {}

/** Normalise to E.164. 10 digits or 1+10 digits are treated as North American (+1). Otherwise needs a leading +. */
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function unescapeValue(v: string): string {
  return v.replace(/\\([nN,;\\])/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function parseVCard(input: string | Uint8Array): ParsedContact[] {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  if (bytes.length === 0) throw new VCardError('Empty file');
  if (bytes.length > VCARD_MAX_BYTES) throw new VCardError('File too large');
  if (bytes.includes(0)) throw new VCardError('Not a text vCard file');
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '');
  if (!/^\s*BEGIN:VCARD/i.test(text) || !/END:VCARD/i.test(text)) throw new VCardError('Not a vCard file');

  const out: ParsedContact[] = [];
  let cur: (ParsedContact & { fn?: string; n?: string }) | null = null;
  for (const line of unfold(text)) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VCARD') { cur = { name: '', tags: [] }; continue; }
    if (upper === 'END:VCARD') {
      if (cur) {
        const name = (cur.fn || cur.n || cur.company || '').trim();
        if (name) {
          out.push({ name: name.substring(0, 200), email: cur.email, phone: cur.phone, company: cur.company, notes: cur.notes, tags: cur.tags.slice(0, 20) });
          if (out.length > VCARD_MAX_CARDS) throw new VCardError('Too many contacts in one file');
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const head = line.substring(0, idx);
    const value = line.substring(idx + 1);
    const prop = head.split(';')[0].replace(/^[A-Za-z0-9-]+\./, '').toUpperCase(); // drop Apple "item1." group prefix
    switch (prop) {
      case 'FN': cur.fn = unescapeValue(value).substring(0, 200); break;
      case 'N': {
        const [family, given] = value.split(';').map(unescapeValue);
        cur.n = [given, family].filter(Boolean).join(' ').substring(0, 200);
        break;
      }
      case 'EMAIL': {
        const e = unescapeValue(value).trim().toLowerCase();
        if (!cur.email && EMAIL_RE.test(e) && e.length <= 254) cur.email = e;
        break;
      }
      case 'TEL': {
        const p = toE164(unescapeValue(value).replace(/^tel:/i, ''));
        if (!cur.phone && p) cur.phone = p;
        break;
      }
      case 'ORG': cur.company = unescapeValue(value.split(';')[0]).substring(0, 200) || undefined; break;
      case 'NOTE': cur.notes = unescapeValue(value).substring(0, 2000) || undefined; break;
      case 'CATEGORIES':
        for (const t of value.split(',').map((x) => unescapeValue(x).trim()).filter(Boolean)) cur.tags.push(t.substring(0, 40));
        break;
      default: break; // PHOTO, URL, ADR, etc. are ignored.
    }
  }
  return out;
}

/** Browser action classes (decision R10 option C). Reads are Class B. Writes are Class B only on domains Victor allow-lists. */
import { localOnlyBlocksUrl } from '@/lib/local-only';

export type BrowserAction = 'read' | 'write';
// Login, payment and account-settings pages: a write here is Class C even on an allow-listed domain.
const SENSITIVE = /(log-?in|sign-?(in|up)|auth|password|checkout|payment|billing|pay\b|card|wallet|account|settings|security|profile|2fa|verify)/i;

export function parseWebUrl(raw: string): URL | null {
  try { const u = new URL(raw); return u.protocol === 'https:' || u.protocol === 'http:' ? u : null; } catch { return null; }
}
export function domainAllowed(host: string, allow: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allow.some((d) => { const a = d.toLowerCase(); return h === a || h.endsWith('.' + a); });
}
export function isSensitivePage(u: URL): boolean { return SENSITIVE.test(u.hostname + u.pathname); }

export function classifyBrowserAction(action: BrowserAction, rawUrl: string, allow: readonly string[]): { class: 'B' | 'C' | null; reason: string } {
  const u = parseWebUrl(rawUrl);
  if (!u) return { class: null, reason: 'only http and https pages' };
  if (localOnlyBlocksUrl(rawUrl)) return { class: null, reason: 'blocked in Local-Only mode' };
  if (action === 'read') return { class: 'B', reason: 'read' };
  if (isSensitivePage(u)) return { class: 'C', reason: 'login, payment or account-settings page' };
  return domainAllowed(u.hostname, allow) ? { class: 'B', reason: 'write on an allow-listed domain' } : { class: 'C', reason: 'write on a domain not on the allow-list' };
}

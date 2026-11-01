// Pure formatting helpers for the operations screens. Deterministic (UTC), so server and client agree.

/** "2026-10-26 14:03:09 UTC" from an ISO string; falls back to the raw text for anything unparseable. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso).slice(0, 40);
  return `${new Date(t).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** "ledger_entry" or "AWAITING_APPROVAL" to "Ledger entry" / "Awaiting approval". */
export function humanize(s: string | null | undefined): string {
  if (!s) return '--';
  const t = s.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '--';
}

/** Actions that mean the system defended itself. Only these get the denial colour. */
const SECURITY_RE = /(injection|hash[_-]?(?:mismatch|lock)|cross[_-]?tenant|security|secret[_-]?dropped|tenant[_-]?violation|untrusted)/i;
export function isSecurityAction(action: string | null | undefined): boolean {
  return !!action && SECURITY_RE.test(action);
}

/** Short ids for dense tables: first 8 characters plus an ellipsis. */
export function shortId(id: string | null | undefined): string {
  if (!id) return '--';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** Whole seconds as "3d 4h", "2h 5m", "4m 12s". */
export function fmtUptime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** YYYY-MM-DD from a date input to the ISO bounds the API expects (UTC). */
export function dayStart(d: string): string | null { return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00.000Z` : null; }
export function dayEnd(d: string): string | null { return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T23:59:59.999Z` : null; }

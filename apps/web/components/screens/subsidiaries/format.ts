// Deterministic formatting (UTC, fixed month names) so server and client markup always match.
import type { HoloTone } from '@/components/ui/holo';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No date';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function humanize(s: string | null | undefined): string {
  if (!s) return 'Unknown';
  const t = s.replace(/[_-]+/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Status tones always travel with a text label. Amber and denial are never used here.
export function statusTone(status: string | null | undefined): HoloTone {
  switch ((status ?? '').toUpperCase()) {
    case 'ACTIVE': case 'IN_PROGRESS': return 'accent';
    case 'COMPLETED': case 'DONE': case 'DECIDED': case 'ANSWERED': case 'MITIGATED': case 'CLOSED': return 'deep';
    case 'BLOCKED': case 'AT_RISK': case 'OPEN': return 'ember';
    default: return 'neutral';
  }
}

export function levelTone(level: string | null | undefined): HoloTone {
  const l = (level ?? '').toUpperCase();
  return l === 'HIGH' || l === 'CRITICAL' ? 'ember' : l === 'MEDIUM' ? 'accent' : 'neutral';
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

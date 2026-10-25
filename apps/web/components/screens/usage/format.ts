// Fixed-locale formatters so server and client render identical text (SSR safety).
const NUM = new Intl.NumberFormat('en-US');
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtInt = (n: number): string => NUM.format(Math.round(n));
export const fmtCompact = (n: number): string => COMPACT.format(n);
export const fmtUsd = (micros: number): string => `$${(micros / 1_000_000).toFixed(micros >= 1_000_000 ? 2 : 4)}`;
export const fmtDay = (iso: string): string => iso.slice(5); // MM-DD

export function countdown(ms: number): string {
  if (ms <= 0) return '0d 0h 0m 0s';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

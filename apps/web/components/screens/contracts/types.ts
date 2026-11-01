// Shapes served by /api/contracts and /api/contracts/[id]. All text fields are untrusted: render as React text only.
// Validation mirrors lib/contracts/service.ts (the server stays the authority).
import type { HoloTone } from '@/components/ui/holo';

export const CONTRACT_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'TERMINATED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface Contract {
  id: string;
  title: string;
  counterparty: string;
  subsidiary: string | null;
  projectId: string | null;
  valueAmount: string | null;
  currency: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ContractListResponse { contracts: Contract[]; nextCursor: string | null }
export interface ProjectOption { id: string; name: string; subsidiary?: string | null }

export const STATUS_LABEL: Record<ContractStatus, string> = { DRAFT: 'Draft', ACTIVE: 'Active', COMPLETED: 'Completed', TERMINATED: 'Terminated' };

// Amber and denial are never used for contracts. Every tone travels with a text label.
export function statusTone(status: string): HoloTone {
  switch (status) {
    case 'ACTIVE': return 'accent';
    case 'COMPLETED': return 'deep';
    case 'TERMINATED': return 'ember';
    default: return 'neutral';
  }
}
export function statusLabel(status: string): string {
  return (STATUS_LABEL as Record<string, string>)[status] ?? status;
}

export const TITLE_MAX = 200;
export const NOTES_MAX = 5000;

export interface ContractForm {
  title: string;
  counterparty: string;
  subsidiary: string;
  projectId: string;
  valueAmount: string;
  currency: string;
  status: string;
  startDate: string;
  endDate: string;
  renewalDate: string;
  notes: string;
}

export const EMPTY_FORM: ContractForm = {
  title: '', counterparty: '', subsidiary: '', projectId: '', valueAmount: '', currency: 'CAD', status: 'DRAFT',
  startDate: '', endDate: '', renewalDate: '', notes: '',
};

export function toForm(c: Contract): ContractForm {
  return {
    title: c.title, counterparty: c.counterparty, subsidiary: c.subsidiary ?? '', projectId: c.projectId ?? '',
    valueAmount: c.valueAmount ?? '', currency: c.currency, status: c.status,
    startDate: c.startDate?.slice(0, 10) ?? '', endDate: c.endDate?.slice(0, 10) ?? '', renewalDate: c.renewalDate?.slice(0, 10) ?? '',
    notes: c.notes ?? '',
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/;

export type FormErrors = Partial<Record<keyof ContractForm, string>>;

export function validateContract(f: ContractForm): FormErrors {
  const e: FormErrors = {};
  if (!f.title.trim()) e.title = 'Title is required';
  else if (f.title.trim().length > TITLE_MAX) e.title = `At most ${TITLE_MAX} characters`;
  if (!f.counterparty.trim()) e.counterparty = 'Counterparty is required';
  else if (f.counterparty.trim().length > TITLE_MAX) e.counterparty = `At most ${TITLE_MAX} characters`;
  if (f.valueAmount.trim() && !AMOUNT_RE.test(f.valueAmount.trim())) e.valueAmount = 'A number with at most 2 decimals, no signs or separators';
  if (!/^[A-Za-z]{3}$/.test(f.currency.trim())) e.currency = 'A 3-letter currency code, for example CAD';
  for (const k of ['startDate', 'endDate', 'renewalDate'] as const) {
    const v = f[k];
    if (v && (!DATE_RE.test(v) || Number.isNaN(Date.parse(v)))) e[k] = 'Use a valid date';
  }
  if (!e.startDate && !e.endDate && f.startDate && f.endDate && f.endDate < f.startDate) e.endDate = 'End date must not be before the start date';
  if (f.notes.length > NOTES_MAX) e.notes = `At most ${NOTES_MAX} characters`;
  return e;
}

/** Body for POST/PATCH. Empty optional fields become null so an edit can clear them. */
export function toPayload(f: ContractForm): Record<string, unknown> {
  const nul = (v: string) => (v.trim() ? v.trim() : null);
  return {
    title: f.title.trim(), counterparty: f.counterparty.trim(),
    subsidiary: nul(f.subsidiary), projectId: nul(f.projectId), valueAmount: nul(f.valueAmount),
    currency: f.currency.trim().toUpperCase(), status: f.status,
    startDate: nul(f.startDate), endDate: nul(f.endDate), renewalDate: nul(f.renewalDate),
    notes: f.notes.trim() ? f.notes : null,
  };
}

/** Client-only money formatting. Falls back to plain text if the runtime rejects the code. */
export function fmtMoney(amount: string | null, currency: string): string {
  if (amount === null || amount === undefined) return 'No value set';
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

const DAY_MS = 86_400_000;
/** Whole days from now to the date, rounded up. Negative when past. */
export function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.ceil((t - now) / DAY_MS);
}
export function inDays(n: number): string {
  if (n === 0) return 'today';
  const a = Math.abs(n);
  return n > 0 ? `in ${a} ${a === 1 ? 'day' : 'days'}` : `${a} ${a === 1 ? 'day' : 'days'} ago`;
}

export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const d = (await res.json()) as { error?: unknown };
    if (typeof d.error === 'string' && d.error) return d.error.slice(0, 200);
  } catch { /* fall through */ }
  return fallback;
}

// Shapes of GET /api/approvals/history and GET /api/approvals/history/[id] (see lib/ledger-search.ts toHistoryItem).
export type ApprovalStatus = 'AWAITING_APPROVAL' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'EXECUTED' | 'FAILED';

export interface HistoryItem {
  id: string;
  kind: string;
  tool: string | null;
  summary: string | null;
  /** Already redacted by the server. Untrusted: render as text only. */
  params: unknown;
  permissionClass: string;
  protected: boolean;
  category: 'money' | 'proprietary' | null;
  status: ApprovalStatus | string;
  persona: string;
  correlationId: string;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  expiredAt: string | null;
  executedAt: string | null;
  decidedBy: string | null;
  outcome: { status: string; result: unknown };
}

export interface TrailItem {
  id: string;
  createdAt: string;
  action: string;
  tool: string | null;
  status: string;
  persona: string | null;
  initiator: string;
  inputSummary: string | null;
  outputSummary: string | null;
  correlationId: string | null;
}

export interface HistoryDetail { approval: HistoryItem; ledger: TrailItem[] }

export const STATUS_OPTIONS = [
  { value: 'AWAITING_APPROVAL', label: 'Awaiting approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'EXECUTED', label: 'Ran' },
  { value: 'DENIED', label: 'Denied' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'FAILED', label: 'Failed' },
];
export const CATEGORY_OPTIONS = [
  { value: 'money', label: 'Protected: money' },
  { value: 'proprietary', label: 'Protected: proprietary information' },
];
export const KIND_LABEL: Record<string, string> = {
  tool_call: 'Action',
  ear: 'Outside request',
  autonomy_change: 'Autonomy change',
  scheduled_post: 'Scheduled post',
};
export const KIND_OPTIONS = Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }));

export function stringifyUntrusted(v: unknown): string {
  if (v === null || v === undefined) return '(none)';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2) ?? '(none)'; } catch { return '(unprintable)'; }
}

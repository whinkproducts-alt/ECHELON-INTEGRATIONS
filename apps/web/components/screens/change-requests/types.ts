// Shapes served by /api/change-requests/**. All text (title, body, spec fields) is untrusted: render as text only.
import type { HoloTone } from '@/components/ui/holo';

export const CR_STATUSES = ['DRAFT', 'REFINED', 'AWAITING_APPROVAL', 'SENT', 'IN_PROGRESS', 'PR_OPENED', 'MERGED', 'REJECTED', 'FAILED'] as const;
export const TITLE_MAX = 200;
export const BODY_MAX = 8000;

export interface CrSpec {
  summary: string;
  acceptanceCriteria: string[];
  filesLikelyTouched: string[];
  risks: string[];
  touchesSecurityOrMoney: boolean;
}
export interface ChangeRequest {
  id: string;
  title: string;
  body: string;
  status: string;
  spec: CrSpec | null;
  risk: string | null;
  githubIssueUrl: string | null;
  githubIssueNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', REFINED: 'Refined', AWAITING_APPROVAL: 'Awaiting approval', SENT: 'Sent', IN_PROGRESS: 'In progress',
  PR_OPENED: 'Pull request opened', MERGED: 'Merged', REJECTED: 'Rejected', FAILED: 'Failed',
};
export const statusLabel = (s: string): string => STATUS_LABEL[s] ?? s;

// Amber means a pending approval and nothing else. Denial red is never used here.
export function statusTone(s: string): HoloTone {
  switch (s) {
    case 'AWAITING_APPROVAL': return 'amber';
    case 'REFINED': case 'SENT': case 'IN_PROGRESS': return 'accent';
    case 'PR_OPENED': case 'MERGED': return 'deep';
    case 'REJECTED': case 'FAILED': return 'ember';
    default: return 'neutral';
  }
}

export const STEPS = [
  { key: 'DRAFT', label: 'Write' },
  { key: 'REFINED', label: 'WHINK refines' },
  { key: 'AWAITING_APPROVAL', label: 'You approve' },
  { key: 'SENT', label: 'Sent' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'PR_OPENED', label: 'PR opened' },
  { key: 'MERGED', label: 'Merged' },
] as const;

/** Index of the step the request is on. For REJECTED and FAILED, the last step it is known to have reached. */
export function stepIndex(cr: Pick<ChangeRequest, 'status' | 'spec' | 'githubIssueUrl'>): number {
  const i = STEPS.findIndex((s) => s.key === cr.status);
  if (i >= 0) return i;
  return cr.githubIssueUrl ? 3 : cr.spec ? 1 : 0;
}

/** Transitions the owner may record by hand (mirrors MANUAL_TRANSITIONS on the server). */
export const MANUAL: Record<string, string[]> = {
  SENT: ['IN_PROGRESS', 'REJECTED', 'FAILED'],
  IN_PROGRESS: ['PR_OPENED', 'REJECTED', 'FAILED'],
  PR_OPENED: ['MERGED', 'IN_PROGRESS', 'REJECTED', 'FAILED'],
};
export const MARK_LABEL: Record<string, string> = {
  IN_PROGRESS: 'Mark in progress', PR_OPENED: 'Mark pull request opened', MERGED: 'Mark merged', REJECTED: 'Mark rejected', FAILED: 'Mark failed',
};

/** Only an https://github.com link is ever rendered as a link. */
export function safeGithubUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' && p.hostname === 'github.com' ? p.toString() : null;
  } catch { return null; }
}

export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const d = (await res.json()) as { error?: unknown };
    if (typeof d.error === 'string' && d.error) return d.error.slice(0, 300);
  } catch { /* fall through */ }
  return fallback;
}

// Response shapes of GET /api/skills and GET /api/skills/[id]. All text is untrusted and rendered as text.
export type SkillStatus = 'QUEUED' | 'SCANNING' | 'REJECTED_SECURITY' | 'ASSESSING' | 'ACCEPTED' | 'REJECTED_VALUE' | 'WAITING_MODEL' | 'FAILED';

export interface SkillListItem {
  id: string;
  name: string;
  filename: string;
  sizeBytes: number;
  status: SkillStatus;
  decision: string | null;
  reason: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  memoryCount: number;
  scan: { verdict: 'clean' | 'flagged' | 'critical' | null; score: number | null; counts: Record<string, number> | null } | null;
  committeeSummary: { approvals: number | null; meanScore: number | null } | null;
}

export interface SkillListResponse { submissions: SkillListItem[] }

export interface ScanFindingView { rule: string; severity: string; category: string; message: string; line: number | null }
export interface SkillDetail {
  id: string;
  status: SkillStatus;
  decision: string | null;
  reason: string | null;
  memoryIds: string[];
  scanReport: {
    verdict?: string; score?: number; counts?: Record<string, number>; findings?: ScanFindingView[]; truncated?: boolean;
    agent?: { id: string; name: string; verdict: { verdict: string; findings: string[]; confidence: number } };
  } | null;
  committee: {
    threshold?: number; minApprovals?: number; approvals?: number; meanScore?: number;
    members?: Array<{ id: string; name: string; directorate: string; vote: { valueScore: number; approve: boolean; reasons: string[] } }>;
  } | null;
}
export interface SkillDetailResponse { submission: SkillDetail }

export const TERMINAL: ReadonlySet<SkillStatus> = new Set(['ACCEPTED', 'REJECTED_SECURITY', 'REJECTED_VALUE', 'FAILED']);
/** WAITING_MODEL is not terminal: the sweeper retries it, so the list keeps polling. */
export const isActive = (s: SkillStatus): boolean => !TERMINAL.has(s);

export type StageState = 'done' | 'active' | 'waiting' | 'failed' | 'todo';
export interface Stage { id: string; label: string; state: StageState }

const LABELS = ['Queued', 'Security scan', 'Committee review', 'Added to memory'] as const;

/** Where each status sits in the four stage pipeline. Pure. */
export function stagesFor(item: Pick<SkillListItem, 'status' | 'committeeSummary'>): Stage[] {
  const at = (states: StageState[]): Stage[] => LABELS.map((label, i) => ({ id: `s${i}`, label, state: states[i] }));
  switch (item.status) {
    case 'QUEUED': return at(['active', 'todo', 'todo', 'todo']);
    case 'SCANNING': return at(['done', 'active', 'todo', 'todo']);
    case 'REJECTED_SECURITY': return at(['done', 'failed', 'todo', 'todo']);
    case 'ASSESSING': return at(['done', 'done', 'active', 'todo']);
    case 'REJECTED_VALUE': return at(['done', 'done', 'failed', 'todo']);
    case 'ACCEPTED': return at(['done', 'done', 'done', 'done']);
    case 'WAITING_MODEL': return item.committeeSummary ? at(['done', 'done', 'waiting', 'todo']) : at(['done', 'waiting', 'todo', 'todo']);
    case 'FAILED': return item.committeeSummary ? at(['done', 'done', 'done', 'failed']) : at(['done', 'failed', 'todo', 'todo']);
    default: return at(['todo', 'todo', 'todo', 'todo']);
  }
}

export const STATE_TEXT: Record<StageState, string> = {
  done: 'Done', active: 'In progress', waiting: 'Waiting', failed: 'Stopped', todo: 'Not reached',
};

export function outcomeFor(status: SkillStatus): { label: string; tone: 'accent' | 'ember' | 'denial' | 'neutral' | 'deep' } {
  switch (status) {
    case 'ACCEPTED': return { label: 'Added to memory', tone: 'accent' };
    case 'REJECTED_SECURITY': return { label: 'Rejected: security', tone: 'denial' };
    case 'REJECTED_VALUE': return { label: 'Rejected: value', tone: 'ember' };
    case 'FAILED': return { label: 'Failed', tone: 'ember' };
    case 'WAITING_MODEL': return { label: 'Waiting for a model to be configured', tone: 'neutral' };
    case 'SCANNING': return { label: 'Security scan', tone: 'deep' };
    case 'ASSESSING': return { label: 'Committee review', tone: 'deep' };
    default: return { label: 'Queued', tone: 'neutral' };
  }
}

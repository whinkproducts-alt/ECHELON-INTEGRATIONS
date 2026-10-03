// Pure helpers for the autonomy-change approval flow. No React, no DOM.
import type { ApprovalView, DecisionStatus } from '@/lib/hooks/approval-state';

export interface AutonomyApproval {
  view: ApprovalView;
  from: number;
  to: number;
}

function isLevel(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 4;
}

/**
 * Parse a server approval of kind 'autonomy_change'. The shared card only knows
 * tool_call and ear, so the view is shown as a tool_call named 'autonomy_change'
 * (display only; the real kind is checked here).
 */
export function parseAutonomyApproval(v: unknown): AutonomyApproval | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.kind !== 'autonomy_change') return null;
  if (typeof o.id !== 'string' || typeof o.summary !== 'string') return null;
  if (typeof o.expiresAt !== 'string' || typeof o.createdAt !== 'string') return null;
  const p = typeof o.params === 'object' && o.params !== null && !Array.isArray(o.params)
    ? (o.params as Record<string, unknown>) : null;
  if (!p || !isLevel(p.from) || !isLevel(p.to)) return null;
  return {
    from: p.from,
    to: p.to,
    view: {
      id: o.id,
      kind: 'tool_call',
      tool: 'autonomy_change',
      summary: o.summary,
      params: p,
      contentHash: typeof o.contentHash === 'string' ? o.contentHash : '',
      permissionClass: typeof o.permissionClass === 'string' ? o.permissionClass : 'C',
      createdAt: o.createdAt,
      expiresAt: o.expiresAt,
    },
  };
}

/** Newest pending autonomy approval from a GET /api/approvals?status=pending body. */
export function pickPendingAutonomy(body: unknown): AutonomyApproval | null {
  if (typeof body !== 'object' || body === null) return null;
  const list = (body as { approvals?: unknown }).approvals;
  if (!Array.isArray(list)) return null;
  let best: AutonomyApproval | null = null;
  for (const item of list) {
    const a = parseAutonomyApproval(item);
    if (a && (best === null || new Date(a.view.createdAt).getTime() >= new Date(best.view.createdAt).getTime())) best = a;
  }
  return best;
}

export type PatchOutcome =
  | { kind: 'applied' }
  | { kind: 'approval'; approval: AutonomyApproval; othersApplied: boolean }
  | { kind: 'error'; message: string };

/** Map a PATCH /api/settings response to what the UI should do. */
export function interpretPatchResponse(status: number, body: unknown): PatchOutcome {
  const o = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (status === 202 && o.requiresApproval === true) {
    const a = parseAutonomyApproval(o.approval);
    if (a) return { kind: 'approval', approval: a, othersApplied: true };
    return { kind: 'error', message: 'Approval request was malformed' };
  }
  if (status === 409) {
    const a = parseAutonomyApproval(o.approval);
    if (a) return { kind: 'approval', approval: a, othersApplied: false };
  }
  if (status >= 200 && status < 300) return { kind: 'applied' };
  return { kind: 'error', message: typeof o.error === 'string' && o.error ? o.error : 'Failed to save' };
}

export interface AutonomyResolution {
  savedLevel: number;
  sliderLevel: number;
  tone: 'success' | 'neutral' | 'error';
  message: string;
}

/** Map a decision outcome to the saved level, the slider level and the status text. */
export function resolveDecision(
  status: DecisionStatus,
  saved: number,
  from: number,
  to: number,
  detail?: string | null,
): AutonomyResolution {
  switch (status) {
    case 'EXECUTED':
      return { savedLevel: to, sliderLevel: to, tone: 'success', message: `Autonomy raised to level ${to}` };
    case 'DENIED':
      return { savedLevel: saved, sliderLevel: saved, tone: 'neutral', message: `Denied. Autonomy stays at level ${saved}` };
    case 'EXPIRED':
      return { savedLevel: saved, sliderLevel: saved, tone: 'neutral', message: `Expired. Autonomy stays at level ${saved}` };
    case 'ALREADY_DECIDED':
      return { savedLevel: saved, sliderLevel: saved, tone: 'neutral', message: `Already decided. Autonomy shown at level ${saved}; reload to confirm` };
    case 'FAILED':
      return { savedLevel: saved, sliderLevel: saved, tone: 'error', message: `Failed${detail ? `: ${detail}` : ''}. Autonomy stays at level ${saved}` };
    default:
      void from;
      return { savedLevel: saved, sliderLevel: saved, tone: 'error', message: `Unrecognised response. Autonomy stays at level ${saved}` };
  }
}

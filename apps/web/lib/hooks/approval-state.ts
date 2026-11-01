// Pure helpers for the approval card. No React, no DOM: safe for SSR and unit tests.

export interface ApprovalView {
  id: string;
  kind: 'tool_call' | 'ear';
  tool: string | null;
  summary: string;
  params: Record<string, unknown> | null;
  contentHash: string;
  permissionClass: string;
  /** True for money movement and disclosure of proprietary information. */
  protected?: boolean;
  category?: 'money' | 'proprietary';
  /** Server code a spoken approval must repeat (post it with postDecision's voice option). */
  confirmationCode?: string | null;
  createdAt: string;
  expiresAt: string;
}

export type DecisionStatus = 'EXECUTED' | 'DENIED' | 'EXPIRED' | 'ALREADY_DECIDED' | 'FAILED';

export interface DecisionResponse {
  id: string;
  status: DecisionStatus;
  result: { success: boolean; data?: unknown; error?: string } | null;
}

export type CardPhase =
  | 'pending'
  | 'submitting'
  | 'executed'
  | 'queued'
  | 'denied'
  | 'expired'
  | 'already_decided'
  | 'failed';

export interface CardState {
  executionId?: string;
  phase: CardPhase;
  /** Short human text for the final status (result or error). */
  detail: string | null;
  /** Set when the request itself failed (network); the card stays actionable. */
  requestError: string | null;
}

export type CardAction =
  | { type: 'submit' }
  | { type: 'response'; response: DecisionResponse }
  | { type: 'request_failed'; message: string }
  | { type: 'tick'; secondsLeft: number };

export const initialCardState: CardState = { phase: 'pending', detail: null, requestError: null };

/** Whole seconds until expiresAt, rounded up, clamped at 0. Invalid dates count as expired. */
export function secondsRemaining(expiresAt: string | number | Date, now: number): number {
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

export function isTerminal(phase: CardPhase): boolean {
  return phase !== 'pending' && phase !== 'submitting';
}

export function shortResult(result: DecisionResponse['result'], max = 160): string | null {
  if (!result) return null;
  let text: string;
  if (result.error) text = result.error;
  else if (result.data === undefined || result.data === null) text = result.success ? 'Done' : 'No result';
  else if (typeof result.data === 'string') text = result.data;
  else {
    try { text = JSON.stringify(result.data) ?? ''; } catch { text = String(result.data); }
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function approvalReducer(state: CardState, action: CardAction): CardState {
  switch (action.type) {
    case 'submit':
      // Only one request at a time, and never after a final state.
      return state.phase === 'pending' ? { ...state, phase: 'submitting', requestError: null } : state;
    case 'request_failed':
      return state.phase === 'submitting'
        ? { phase: 'pending', detail: null, requestError: action.message }
        : state;
    case 'tick':
      return state.phase === 'pending' && action.secondsLeft <= 0
        ? { phase: 'expired', detail: null, requestError: null }
        : state;
    case 'response': {
      if (isTerminal(state.phase)) return state;
      const { status, result } = action.response;
      switch (status) {
        case 'EXECUTED':
          if (result?.success && result.data && typeof result.data === 'object' &&
              'executionId' in result.data && typeof result.data.executionId === 'string' &&
              'status' in result.data && result.data.status === 'QUEUED') {
            return { phase: 'queued', detail: 'Internal analysis queued; not yet completed.', executionId: result.data.executionId, requestError: null };
          }
          return { phase: 'executed', detail: shortResult(result), requestError: null };
        case 'DENIED':
          return { phase: 'denied', detail: null, requestError: null };
        case 'EXPIRED':
          return { phase: 'expired', detail: null, requestError: null };
        case 'ALREADY_DECIDED':
          return { phase: 'already_decided', detail: null, requestError: null };
        case 'FAILED':
          return { phase: 'failed', detail: shortResult(result) ?? 'Action failed', requestError: null };
        default:
          return { phase: 'failed', detail: 'Unrecognised response', requestError: null };
      }
    }
  }
}

export function isApprovalView(v: unknown): v is ApprovalView {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    (o.kind === 'tool_call' || o.kind === 'ear') &&
    typeof o.summary === 'string' &&
    typeof o.expiresAt === 'string' &&
    typeof o.createdAt === 'string'
  );
}

export function normalizeApproval(v: unknown): ApprovalView | null {
  if (!isApprovalView(v)) return null;
  const o = v as unknown as Record<string, unknown>;
  const params = typeof o.params === 'object' && o.params !== null && !Array.isArray(o.params)
    ? (o.params as Record<string, unknown>)
    : null;
  return {
    id: v.id,
    kind: v.kind,
    tool: typeof o.tool === 'string' ? o.tool : null,
    summary: v.summary,
    params,
    contentHash: typeof o.contentHash === 'string' ? o.contentHash : '',
    permissionClass: typeof o.permissionClass === 'string' ? o.permissionClass : 'C',
    protected: o.protected === true || o.category === 'money' || o.category === 'proprietary',
    category: o.category === 'money' || o.category === 'proprietary' ? o.category : undefined,
    confirmationCode: typeof o.confirmationCode === 'string' && o.confirmationCode ? o.confirmationCode : null,
    createdAt: v.createdAt,
    expiresAt: v.expiresAt,
  };
}

/** Pretty-printed params as plain text. Never HTML. */
export function formatParams(params: Record<string, unknown> | null): string {
  if (params === null) return '(no parameters)';
  try { return JSON.stringify(params, null, 2); } catch { return '(unprintable parameters)'; }
}

/** Most recent approval by createdAt among the given pending ids. */
export function mostRecent(approvals: readonly ApprovalView[]): ApprovalView | null {
  let best: ApprovalView | null = null;
  for (const a of approvals) {
    if (best === null || new Date(a.createdAt).getTime() >= new Date(best.createdAt).getTime()) best = a;
  }
  return best;
}

export async function postDecision(
  id: string,
  decision: 'approve' | 'deny',
  voice?: { code: string },
): Promise<DecisionResponse> {
  const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(voice ? { decision, via: 'voice', code: voice.code } : { decision }),
  });
  if (res.status === 404) throw new Error('Approval not found');
  if (res.status === 403) throw new Error('Confirmation code rejected');
  if (!res.ok) throw new Error(`Decision failed (${res.status})`);
  const data: unknown = await res.json();
  const o = data as Partial<DecisionResponse> | null;
  if (!o || typeof o.status !== 'string') throw new Error('Malformed decision response');
  return { id: typeof o.id === 'string' ? o.id : id, status: o.status, result: o.result ?? null };
}

/**
 * Saved first/second/third order, applied only before a side effect.
 *
 * A failed model call may be followed by the next eligible candidate. That is a new
 * admission, not a retry of the call that failed. Once a tool has run, or any byte has
 * been sent to the client, nothing in this module authorises another model: replaying
 * the turn could repeat an external action or a partial answer.
 */
import { DispatchBlockedError } from './admission';
import { classifyFailure, markFailure, type RoutePlan } from './priority';

export interface OrderedCandidate {
  id: string;
  model: string;
  /** Present only when this candidate may use a stored user key. Never inherit another candidate's key. */
  apiKey?: string;
}

export interface HandoffStop {
  id: string;
  label: string;
  url: string | null;
}

/** Account-wide refusals. Another model cannot make these true. */
const ACCOUNT_STOP = new Set([
  'MISSING_ACCOUNT',
  'TOKEN_HARD_LIMIT',
  'SPEND_HARD_LIMIT',
  'DB_FAILURE',
  'INVALID_BOUND',
  'ATTEMPT_CONSUMED',
]);

export function orderedFromPlan(plan: RoutePlan): { candidates: OrderedCandidate[]; handoff: HandoffStop | null } {
  const candidates: OrderedCandidate[] = [];
  for (const step of plan.steps) {
    if (step.type === 'handoff') {
      return {
        candidates,
        handoff: { id: step.entry.id, label: step.entry.label, url: step.entry.handoffUrl ?? null },
      };
    }
    candidates.push({ id: step.entry.id, model: step.entry.model });
  }
  return { candidates, handoff: null };
}

/**
 * True only when this failure is specific to the candidate and nothing has been emitted
 * or executed yet. Cancel stops. An account-wide block stops. A lost response does not
 * retry the same call; the caller may try a different candidate.
 */
export function fallbackMayContinue(err: unknown, emitted = false, toolsStarted = false): boolean {
  if (emitted || toolsStarted) return false;
  const name = (err as Error)?.name ?? '';
  const code = (err as { code?: string })?.code;
  if ((err instanceof DispatchBlockedError || name === 'DispatchBlockedError') && code && ACCOUNT_STOP.has(code)) return false;
  const msg = String((err as Error)?.message ?? err ?? '');
  if (name === 'AbortError' || /\bcancel(?:led|ed)?\b/i.test(msg)) return false;
  return true;
}

/** Health is per registry id. Policy refusals are not provider failures. */
export function noteCandidateFailure(id: string, err: unknown): void {
  if (!id || err instanceof DispatchBlockedError) return;
  markFailure(id, classifyFailure(err));
}

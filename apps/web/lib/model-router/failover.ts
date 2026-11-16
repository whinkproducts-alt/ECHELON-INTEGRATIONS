/**
 * Item 31: live failover. Walks the planned candidates in order; a failed candidate is marked unhealthy, the switch is
 * ledgered (`model_failover`, from to reason), and the next candidate answers. Only for pure inference, before any
 * tool ran or any byte was sent (fallbackMayContinue). Account-wide admission refusals stop the walk.
 */
import { recordActionSafe } from '@/lib/ledger';
import { fallbackMayContinue, noteCandidateFailure, type OrderedCandidate } from './ordered-dispatch';

export type FailoverResult =
  | { ok: true; text: string; used: string; attempts: Array<{ id: string; error?: string }> }
  | { ok: false; reason: 'no_candidates' | 'all_failed' | 'stopped'; attempts: Array<{ id: string; error?: string }> };

export async function chatWithFailover(
  input: { userId: string; correlationId: string; candidates: OrderedCandidate[] },
  call: (c: OrderedCandidate) => Promise<string>,
): Promise<FailoverResult> {
  const attempts: Array<{ id: string; error?: string }> = [];
  if (input.candidates.length === 0) return { ok: false, reason: 'no_candidates', attempts };
  for (let i = 0; i < input.candidates.length; i++) {
    const c = input.candidates[i];
    try {
      const text = await call(c);
      attempts.push({ id: c.id });
      return { ok: true, text, used: c.id, attempts };
    } catch (e) {
      const code = (e as { code?: string })?.code ?? (e as Error)?.name ?? 'error';
      attempts.push({ id: c.id, error: code });
      noteCandidateFailure(c.id, e);
      if (!fallbackMayContinue(e)) return { ok: false, reason: 'stopped', attempts };
      const next = input.candidates[i + 1];
      if (next) {
        await recordActionSafe({
          userId: input.userId, initiator: 'system', action: 'model_failover', tool: 'model_priority', permissionClass: 'A', status: 'EXECUTED',
          correlationId: input.correlationId, inputSummary: `from=${c.id} to=${next.id} reason=${String(code).slice(0, 40)}`,
        });
      }
    }
  }
  return { ok: false, reason: 'all_failed', attempts };
}

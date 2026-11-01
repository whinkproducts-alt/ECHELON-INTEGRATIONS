/**
 * Run a server-side action behind the permission engine and write the result to the ledger.
 * Used by API routes that are not model tool calls (board meetings, connectors, budget).
 *
 * Order is fixed: checkPermission, then run, then ledger (success or failure). A denial is
 * ledgered and the function never runs. Ledger summaries must never carry secrets or
 * free-text bodies: pass counts, ids and names only.
 */
import { checkPermission, capabilityClass, type PermissionClass } from '@/lib/permission-engine';
import { recordActionSafe } from '@/lib/ledger';
import { generateCorrelationId, logger } from '@/lib/logger';

export interface GuardedSpec {
  userId: string;
  capability: string;
  permissionClass: PermissionClass;
  /** Ledger action name, for example 'board_meeting_created'. */
  action: string;
  /** Short, non-sensitive summary for inputSummary. */
  summary?: string;
  persona?: string;
  correlationId?: string;
}

export type GuardedResult<T> =
  | { ok: true; value: T; correlationId: string }
  | { ok: false; status: 403 | 500; error: string; correlationId: string };

export async function runGuarded<T>(spec: GuardedSpec, fn: () => Promise<T>): Promise<GuardedResult<T>> {
  const correlationId = spec.correlationId ?? generateCorrelationId();
  const base = {
    userId: spec.userId,
    initiator: 'user' as const,
    persona: spec.persona ?? 'WHINK',
    tool: spec.capability,
    action: spec.action,
    permissionClass: spec.permissionClass,
    inputSummary: spec.summary,
    correlationId,
  };
  const started = Date.now();
  let perm;
  try {
    // The registered class wins. A caller asking for a lower class than registered is refused.
    const registered = capabilityClass(spec.capability);
    if (registered !== spec.permissionClass) {
      await recordActionSafe({ ...base, status: 'DENIED', outputSummary: 'capability class mismatch' });
      return { ok: false, status: 403, error: 'Capability not registered for this class', correlationId };
    }
    perm = await checkPermission(spec.userId, spec.capability, registered, correlationId);
  } catch (e) {
    logger.error('permission check failed', { userId: spec.userId, capability: spec.capability, error: (e as Error)?.message });
    await recordActionSafe({ ...base, status: 'FAILED', outputSummary: 'permission check failed' });
    return { ok: false, status: 500, error: 'Permission check failed', correlationId };
  }
  if (!perm.allowed) {
    await recordActionSafe({ ...base, status: 'DENIED', outputSummary: perm.reason ?? 'denied', confirmationMethod: perm.method });
    return { ok: false, status: 403, error: perm.reason ?? 'Not permitted', correlationId };
  }
  try {
    const value = await fn();
    await recordActionSafe({ ...base, status: 'VALIDATED', confirmationMethod: perm.method, latencyMs: Date.now() - started });
    return { ok: true, value, correlationId };
  } catch (e) {
    logger.error('guarded action failed', { userId: spec.userId, action: spec.action, error: (e as Error)?.message });
    await recordActionSafe({ ...base, status: 'FAILED', confirmationMethod: perm.method, outputSummary: 'action failed', latencyMs: Date.now() - started });
    return { ok: false, status: 500, error: 'Action failed', correlationId };
  }
}

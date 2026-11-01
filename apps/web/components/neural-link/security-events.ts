// Maps ledger rows to security events for display. Pure, no DOM.
import type { SecurityEvent, SecurityEventKind } from './security-event-display';

interface LedgerRow {
  id?: unknown; action?: unknown; status?: unknown; inputSummary?: unknown; outputSummary?: unknown; createdAt?: unknown;
}

function kindOf(action: string, status: string): SecurityEventKind | null {
  const a = action.toLowerCase();
  if (a.includes('injection')) return 'injection_blocked';
  if (a.includes('hash')) return 'approval_hash_mismatch';
  if (a.includes('cross_tenant') || a.includes('other_user')) return 'cross_tenant_attempt';
  if (status === 'DENIED') return 'action_blocked';
  return null;
}

export function ledgerToSecurityEvents(body: unknown): SecurityEvent[] {
  if (!Array.isArray(body)) return [];
  const out: SecurityEvent[] = [];
  for (const raw of body as LedgerRow[]) {
    if (!raw || typeof raw !== 'object') continue;
    const action = typeof raw.action === 'string' ? raw.action : '';
    const status = typeof raw.status === 'string' ? raw.status : '';
    const kind = kindOf(action, status);
    const ts = typeof raw.createdAt === 'string' ? Date.parse(raw.createdAt) : NaN;
    if (!kind || Number.isNaN(ts) || typeof raw.id !== 'string') continue;
    const detail = [raw.outputSummary, raw.inputSummary].find((v): v is string => typeof v === 'string' && v.length > 0) ?? action;
    out.push({ id: raw.id, kind, detail, ts });
  }
  return out;
}

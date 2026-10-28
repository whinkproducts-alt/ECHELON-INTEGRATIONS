/**
 * Ledger helper for routes that refuse a request in Local-Only mode. Kept apart from lib/local-only.ts
 * so that module stays pure and import-light.
 */
import { recordActionSafe } from '@/lib/ledger';

export async function ledgerLocalOnlyBlock(userId: string | undefined, tool: string, detail: string, correlationId?: string): Promise<void> {
  if (!userId) return;
  await recordActionSafe({
    userId,
    initiator: 'system',
    persona: 'WHINK',
    action: 'local_only_blocked',
    tool,
    permissionClass: 'C',
    status: 'DENIED',
    inputSummary: detail.slice(0, 200),
    outputSummary: 'local_only',
    correlationId: correlationId ?? 'unknown',
  });
}

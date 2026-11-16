/**
 * Gate for every exec, browser and remote action: permission engine first, ledger always.
 * Class B goes through checkPermission. Class C runs only with an approval id that checkApprovedAction accepts for the
 * exact capability and params (hash-locked, once, 30 s window). No bypass, no test switch.
 */
import { checkApprovedAction, checkPermission } from '@/lib/permission-engine';
import { approvalContentHash } from '@/lib/canonical-json';
import { writeLedger } from '@/lib/ledger';

export type ExecClass = 'B' | 'C';
export interface GateInput { userId: string; capability: string; cls: ExecClass; params: unknown; approvalId?: string; correlationId?: string; summary: string }
export type GateResult = { ok: true } | { ok: false; needsApproval: boolean; reason: string; approval?: { kind: 'tool_call'; tool: string; params: unknown; summary: string } };

export async function gate(i: GateInput): Promise<GateResult> {
  let res: GateResult;
  if (i.cls === 'C') {
    if (!i.approvalId) res = { ok: false, needsApproval: true, reason: 'Needs your approval by request id', approval: { kind: 'tool_call', tool: i.capability, params: i.params, summary: i.summary } };
    else {
      const r = await checkApprovedAction(i.userId, i.approvalId, i.capability, approvalContentHash({ kind: 'tool_call', tool: i.capability, params: i.params }));
      res = r.allowed ? { ok: true } : { ok: false, needsApproval: false, reason: r.reason ?? 'Approval refused' };
    }
  } else {
    const r = await checkPermission(i.userId, i.capability, 'B', i.correlationId, { params: i.params });
    res = r.allowed ? { ok: true } : { ok: false, needsApproval: false, reason: r.reason ?? 'Not permitted' };
  }
  if (!res.ok) await writeLedger({ userId: i.userId, action: i.capability, tool: i.capability, permissionClass: i.cls, status: res.needsApproval ? 'AWAITING_APPROVAL' : 'DENIED', correlationId: i.correlationId, inputSummary: i.summary.slice(0, 500), approvalId: i.approvalId ?? null });
  return res;
}

/** Ledger the outcome of a run that the gate allowed. Summaries only, never output content. */
export async function ledgerRun(i: GateInput, status: 'EXECUTED' | 'FAILED', out: string): Promise<void> {
  await writeLedger({ userId: i.userId, action: i.capability, tool: i.capability, permissionClass: i.cls, status, correlationId: i.correlationId, inputSummary: i.summary.slice(0, 500), outputSummary: out.slice(0, 200), approvalId: i.approvalId ?? null });
}

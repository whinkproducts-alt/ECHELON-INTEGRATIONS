import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';
import { approvalContentHash } from '@/lib/canonical-json';
import { MARCUS_JOB_PREFIX } from '@/lib/marcus/freeze';

export type TaskResult = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): TaskResult => ({ status, body: { error } });

async function load(userId: string, id: string) {
  const job = await prisma.agentJob.findFirst({ where: { id, userId, jobKey: { startsWith: MARCUS_JOB_PREFIX } } });
  return job;
}
const view = (j: { id: string; jobKey: string; lastStatus: string | null; createdAt: Date }) =>
  ({ task_id: j.id, client_operation_id: j.jobKey.slice(MARCUS_JOB_PREFIX.length), status: j.lastStatus ?? 'received', created_at: j.createdAt.toISOString() });

/** What the analysis produced, only once the task is done. Model output is untrusted text. */
async function resultOf(j: { lastStatus: string | null; capabilityReceiptId: string | null; userId: string }) {
  if (j.lastStatus !== 'done' || !j.capabilityReceiptId) return undefined;
  const exs = await prisma.agentExecution.findMany({ where: { id: { in: j.capabilityReceiptId.split(',') }, userId: j.userId }, select: { output: true }, orderBy: { createdAt: 'asc' } });
  const agents = exs.flatMap((ex) => { const a = (ex.output as { agents?: Array<{ agentId?: unknown; result?: unknown }> } | null)?.agents; return Array.isArray(a) ? a.slice(0, 5) : []; });
  if (!agents.length) return undefined;
  return { untrusted: true, outputs: agents.map((a) => ({ agent_id: String(a.agentId), text: String(a.result).slice(0, 4000) })) };
}

export async function getMarcusTask(userId: string, id: string): Promise<TaskResult> {
  const job = await load(userId, id);
  if (!job) return fail(404, 'Task not found');
  const result = await resultOf(job);
  // Marcus reads `result_summary` (plain text); `result` keeps the per-agent detail. Both are untrusted model output.
  const result_summary = result?.outputs.map((o) => o.text).join('\n\n').slice(0, 3000);
  return { status: 200, body: result ? { ...view(job), result, result_summary } : view(job) };
}

/**
 * Marcus's second yes for financial or proprietary work. It only moves the task from
 * reconfirmation_required to received. Whatever the task later does still goes through checkPermission,
 * which keeps money and proprietary actions behind ECHELON's own approval.
 */
export async function confirmMarcusTask(userId: string, id: string, approval: unknown): Promise<TaskResult> {
  const a = approval as { approval_id?: unknown; content_hash?: unknown; method?: unknown } | null;
  if (!a || typeof a.approval_id !== 'string' || !a.approval_id || a.approval_id.length > 100 || typeof a.content_hash !== 'string' || !['voice', 'tap'].includes(a.method as string)) {
    return fail(400, 'Invalid approval');
  }
  const job = await load(userId, id);
  if (!job) return fail(404, 'Task not found');
  const contentHash = a.content_hash as string;
  if (job.lastStatus !== 'reconfirmation_required') return fail(409, 'Task is not waiting for a second approval');
  if (a.approval_id === job.capabilityApprovalId) return fail(400, 'The second approval must be a new one');
  if (contentHash !== job.capabilityRequestHash) return fail(400, 'Approval content hash mismatch');

  try {
    await prisma.$transaction(async (tx) => {
      const won = await tx.agentJob.updateMany({ where: { id, userId, lastStatus: 'reconfirmation_required' }, data: { lastStatus: 'received', nextRunAt: new Date() } });
      if (won.count !== 1) throw Object.assign(new Error('raced'), { code: 'RACED' });
      const params = { task_id: id, content_hash: contentHash };
      await tx.approvalRequest.create({
        data: {
          id: a.approval_id as string, userId, kind: 'tool_call', tool: 'marcus_task_reconfirm', params,
          contentHash: approvalContentHash({ kind: 'tool_call', tool: 'marcus_task_reconfirm', params }),
          summary: 'Marcus second approval', permissionClass: 'C', status: 'APPROVED', correlationId: job.jobKey, decidedAt: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      // Close the pending card from intake so it does not linger on the approvals list.
      if (job.capabilityApprovalId) {
        await tx.approvalRequest.updateMany({ where: { id: job.capabilityApprovalId, userId, status: 'PENDING' }, data: { status: 'APPROVED', decidedAt: new Date() } });
      }
      await recordAction({ userId, initiator: 'system', action: 'capability_marcus_task_reconfirmed', permissionClass: 'C', status: 'VALIDATED', correlationId: `marcus-task:${id}` }, tx);
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') return fail(409, 'Approval ID already used');
    if (code === 'RACED') return fail(409, 'Task is not waiting for a second approval');
    throw e;
  }
  return { status: 200, body: { ...view(job), status: 'received' } };
}

/** Marcus answers a blocked or paused task. Only a task whose analysis never started can resume; its approval is otherwise used. The note is not stored. */
export async function resumeMarcusTask(userId: string, id: string): Promise<TaskResult> {
  const job = await load(userId, id);
  if (!job) return fail(404, 'Task not found');
  const won = await prisma.agentJob.updateMany({ where: { id, userId, capabilityReceiptId: null, lastStatus: { in: ['blocked', 'paused'] } }, data: { lastStatus: 'received', nextRunAt: new Date() } });
  if (won.count !== 1) return fail(409, 'Task is not waiting for an answer');
  await recordAction({ userId, initiator: 'system', action: 'capability_marcus_task_resumed', permissionClass: 'A', status: 'EXECUTED', correlationId: `marcus-task:${id}` });
  return { status: 200, body: { ...view(job), status: 'received' } };
}

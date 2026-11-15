import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';
import { approvalContentHash } from '@/lib/canonical-json';
import { MARCUS_JOB_PREFIX } from '@/lib/marcus/freeze';

export type TaskResult = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): TaskResult => ({ status, body: { error } });

async function load(userId: string, id: string) {
  const job = await prisma.agentJob.findFirst({ where: { id, userId, jobKey: { startsWith: MARCUS_JOB_PREFIX } } });
  return job && !job.jobKey.endsWith('__freeze__') ? job : null;
}
const view = (j: { id: string; jobKey: string; lastStatus: string | null; createdAt: Date }) =>
  ({ task_id: j.id, client_operation_id: j.jobKey.slice(MARCUS_JOB_PREFIX.length), status: j.lastStatus ?? 'received', created_at: j.createdAt.toISOString() });

export async function getMarcusTask(userId: string, id: string): Promise<TaskResult> {
  const job = await load(userId, id);
  return job ? { status: 200, body: view(job) } : fail(404, 'Task not found');
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
      const won = await tx.agentJob.updateMany({ where: { id, userId, lastStatus: 'reconfirmation_required' }, data: { lastStatus: 'received' } });
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

/** Marcus answers a blocked or paused task. The note is not stored: nothing reads it until a worker handler exists. */
export async function resumeMarcusTask(userId: string, id: string): Promise<TaskResult> {
  const job = await load(userId, id);
  if (!job) return fail(404, 'Task not found');
  const won = await prisma.agentJob.updateMany({ where: { id, userId, lastStatus: { in: ['blocked', 'paused'] } }, data: { lastStatus: 'received' } });
  if (won.count !== 1) return fail(409, 'Task is not waiting for an answer');
  await recordAction({ userId, initiator: 'system', action: 'capability_marcus_task_resumed', permissionClass: 'A', status: 'EXECUTED', correlationId: `marcus-task:${id}` });
  return { status: 200, body: { ...view(job), status: 'received' } };
}

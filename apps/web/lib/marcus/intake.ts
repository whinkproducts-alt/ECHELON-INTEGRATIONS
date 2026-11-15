import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { canonicalJson, approvalContentHash } from '@/lib/canonical-json';
import { recordAction } from '@/lib/ledger';
import { isLockedDown } from '@/lib/safety/lockdown';
import { isMarcusFrozen, resolveMarcusOwner, MARCUS_NEVER_RUN } from '@/lib/marcus/freeze';

export interface MarcusTaskInput {
  client_operation_id: string;
  title: string;
  goal: string;
  deadline: string | null;
  requested_for: string;
  approval: { approval_id: string; approved_at: string; method: 'voice' | 'tap'; content_hash: string };
  sensitivity: 'standard' | 'proprietary' | 'financial';
  directorate: string | null;
}

const RECONFIRM = new Set(['financial', 'proprietary']);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;

export async function intakeMarcusTask(req: Request) {
  const auth = requireMarcusAuth(req);
  if (!auth.ok) return bad(auth.error, auth.status);

  let body: MarcusTaskInput;
  try { body = await req.json(); } catch { return bad('Invalid JSON body'); }

  if (!body || !str(body.client_operation_id, 100) || !str(body.title, 200) || !str(body.goal, 10_000) || !body.approval || !str(body.approval.approval_id, 100)) {
    return bad('Missing or oversized required fields');
  }
  if (body.deadline !== null && typeof body.deadline !== 'string') return bad('Invalid deadline');
  if (!['standard', 'proprietary', 'financial'].includes(body.sensitivity)) return bad('Invalid sensitivity value');
  if (!['voice', 'tap'].includes(body.approval.method)) return bad('Invalid approval method');

  const computed = createHash('sha256').update(canonicalJson({ title: body.title, goal: body.goal, deadline: body.deadline })).digest('hex');
  if (computed !== body.approval.content_hash) return bad('Approval content hash mismatch');

  const owner = await resolveMarcusOwner();
  if (!owner) return bad('Owner account is not configured (WHINK_OWNER_EMAILS)', 503);
  if (await isLockedDown(owner.id)) return bad('Lockdown is active', 503);
  if (await isMarcusFrozen(owner.id)) return bad('Marcus tasks are frozen', 503);

  const jobKey = `marcus:${body.client_operation_id}`;
  const existing = await prisma.agentJob.findUnique({ where: { jobKey_userId: { jobKey, userId: owner.id } } });
  if (existing) {
    return NextResponse.json({ task_id: existing.id, client_operation_id: body.client_operation_id, status: existing.lastStatus ?? 'received', created_at: existing.createdAt.toISOString() });
  }

  const reconfirm = RECONFIRM.has(body.sensitivity);
  const status = reconfirm ? 'reconfirmation_required' : 'received';
  const params = { client_operation_id: body.client_operation_id, content_hash: body.approval.content_hash };
  const correlationId = jobKey;

  let task;
  try {
    task = await prisma.$transaction(async (tx) => {
      // The Marcus approval_id is the row id, so a replayed approval collides on the primary key.
      await tx.approvalRequest.create({
        data: {
          id: body.approval.approval_id, userId: owner.id, kind: 'tool_call', tool: 'marcus_task_intake', params,
          contentHash: approvalContentHash({ kind: 'tool_call', tool: 'marcus_task_intake', params }),
          summary: body.title.slice(0, 200), permissionClass: reconfirm ? 'C' : 'A',
          status: reconfirm ? 'PENDING' : 'APPROVED', correlationId,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      const job = await tx.agentJob.create({
        data: { jobKey, userId: owner.id, nextRunAt: MARCUS_NEVER_RUN, lastStatus: status, capabilityRequestHash: body.approval.content_hash, capabilityApprovalId: body.approval.approval_id },
      });
      await tx.sealedScope.create({ data: { userId: owner.id, kind: 'OBJECTIVE', refId: job.id } });
      await recordAction({
        userId: owner.id, initiator: 'system', action: 'capability_marcus_task_received', permissionClass: reconfirm ? 'C' : 'A',
        status: reconfirm ? 'AWAITING_APPROVAL' : 'VALIDATED', errorCode: reconfirm ? 'RECONFIRMATION_REQUIRED' : null,
        capabilityId: job.id, inputSummary: `title=${body.title} sensitivity=${body.sensitivity}`, correlationId,
      }, tx);
      return job;
    });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') return bad('Approval ID or operation already used', 409);
    throw e;
  }

  return NextResponse.json({ task_id: task.id, client_operation_id: body.client_operation_id, status, created_at: task.createdAt.toISOString() });
}

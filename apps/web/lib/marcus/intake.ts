import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { canonicalJson, approvalContentHash } from '@/lib/canonical-json';
import { recordAction } from '@/lib/ledger';
import { encryptKey, isEncryptionConfigured } from '@/lib/key-encryption';
import { isLockedDown } from '@/lib/safety/lockdown';
import { isMarcusFrozen, resolveMarcusOwner, MARCUS_NEVER_RUN } from '@/lib/marcus/freeze';
import { parseSubsidiaries } from '@/lib/marcus/routing';
import { classifyProtected } from '@/lib/protected-actions';
import { attachmentKeys } from '@/lib/safety/marcus-no-attachments';

export interface MarcusTaskInput {
  client_operation_id: string;
  title: string;
  goal: string;
  deadline: string | null;
  requested_for: string;
  approval: { approval_id: string; approved_at: string; method: 'voice' | 'tap'; content_hash: string };
  sensitivity: 'standard' | 'proprietary' | 'financial';
  directorate: string | null;
  /** Subsidiary the request comes from, and other subsidiaries it involves. Optional; ids are validated. */
  subsidiary?: string | null;
  target_subsidiaries?: string[] | null;
}

const RECONFIRM = new Set(['financial', 'proprietary']);
const MONEY_STEMS = /\b(pay\w*|paid|transfer\w*|e-?transfer|wir(?:e|es|ed|ing)|invoic\w*|re-?fund\w*|remit\w*|reimburs\w*|settle\w*|withdraw\w*|purchas\w*)\b/i;
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
  if (attachmentKeys(body).length) return bad('Marcus tasks cannot carry attached documents or memory');
  if (body.deadline !== null && typeof body.deadline !== 'string') return bad('Invalid deadline');
  if (!['standard', 'proprietary', 'financial'].includes(body.sensitivity)) return bad('Invalid sensitivity value');
  if (!['voice', 'tap'].includes(body.approval.method)) return bad('Invalid approval method');
  const scope = parseSubsidiaries(body.subsidiary, body.target_subsidiaries);
  if (!scope.ok) return bad(scope.error);
  if (body.directorate != null && (typeof body.directorate !== 'string' || body.directorate.length > 100)) return bad('Invalid directorate');

  const computed = createHash('sha256').update(canonicalJson({ title: body.title, goal: body.goal, deadline: body.deadline })).digest('hex');
  if (computed !== body.approval.content_hash) return bad('Approval content hash mismatch');

  const owner = await resolveMarcusOwner();
  if (!owner) return bad('Owner account is not configured (WHINK_OWNER_EMAILS)', 503);
  if (await isLockedDown(owner.id)) return bad('Lockdown is active', 503);
  if (await isMarcusFrozen(owner.id)) return bad('Marcus tasks are frozen', 503);

  // The task text is kept encrypted only until the executor admits it, then erased; without a key it cannot be stored. The title (first 200 chars) is also in the approval summary so the owner can see what is being approved.
  if (!isEncryptionConfigured()) return bad('Encryption is not configured (ENCRYPTION_KEY)', 503);

  const jobKey = `marcus:${body.client_operation_id}`;
  const existing = await prisma.agentJob.findUnique({ where: { jobKey_userId: { jobKey, userId: owner.id } } });
  if (existing) {
    return NextResponse.json({ task_id: existing.id, client_operation_id: body.client_operation_id, status: existing.lastStatus ?? 'received', created_at: existing.createdAt.toISOString() });
  }

  // The sender's label is a floor: ECHELON's own classifier can only raise it. A classifier error fails closed.
  let upgrade: string | null = null;
  if (!RECONFIRM.has(body.sensitivity)) {
    try {
      const text = `${body.title} ${body.goal}`.normalize('NFKC');
      const c = classifyProtected({ toolName: 'marcus_task_intake', description: text });
      if (c.protected) upgrade = c.category ?? 'proprietary';
      // shortcut: keyword stems and a script-mix check, not semantic understanding; replace with a real classifier later.
      else if (MONEY_STEMS.test(text)) upgrade = 'money';
      else if (/\p{Cf}/u.test(text) || (/\p{Script=Latin}/u.test(text) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(text))) upgrade = 'obfuscated_text';
    } catch { upgrade = 'classifier_error'; }
  }
  const reconfirm = RECONFIRM.has(body.sensitivity) || upgrade !== null;
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
        data: { jobKey, userId: owner.id, nextRunAt: reconfirm ? MARCUS_NEVER_RUN : new Date(), lastStatus: status, capabilityRequestHash: body.approval.content_hash,
          capabilityRequestEnc: encryptKey(JSON.stringify({ title: body.title, goal: body.goal, deadline: body.deadline, directorate: body.directorate ?? null, subsidiary: scope.value.subsidiary, targets: scope.value.targets })), capabilityApprovalId: body.approval.approval_id },
      });
      await tx.sealedScope.create({ data: { userId: owner.id, kind: 'OBJECTIVE', refId: job.id } });
      if (upgrade) {
        await recordAction({
          userId: owner.id, initiator: 'system', action: 'capability_marcus_sensitivity_upgraded', permissionClass: 'C', status: 'AWAITING_APPROVAL',
          errorCode: 'RECONFIRMATION_REQUIRED', inputSummary: `declared=${body.sensitivity} category=${upgrade}`, correlationId: `marcus-task:${job.id}`,
        }, tx);
      }
      await recordAction({
        userId: owner.id, initiator: 'system', action: 'capability_marcus_task_received', permissionClass: reconfirm ? 'C' : 'A',
        status: reconfirm ? 'AWAITING_APPROVAL' : 'VALIDATED', errorCode: reconfirm ? 'RECONFIRMATION_REQUIRED' : null,
        inputSummary: `sensitivity=${body.sensitivity} hash=${body.approval.content_hash.slice(0, 12)}`, correlationId: `marcus-task:${job.id}`,
      }, tx);
      return job;
    });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') return bad('Approval ID or operation already used', 409);
    throw e;
  }

  return NextResponse.json({ task_id: task.id, client_operation_id: body.client_operation_id, status, created_at: task.createdAt.toISOString() });
}

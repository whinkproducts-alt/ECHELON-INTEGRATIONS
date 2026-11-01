/**
 * Change requests. Every query is scoped by userId; another user's id behaves as not found.
 * Submitting is a PROTECTED action (proprietary): it only creates an approval here. The GitHub
 * call happens in the change_request_submit tool handler after the owner approves that request id.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createApproval, type ApprovalView } from '@/lib/approvals';
import { checkPermission } from '@/lib/permission-engine';
import { runGuarded } from '@/lib/guarded-action';
import { recordActionSafe } from '@/lib/ledger';
import { generateCorrelationId, logger } from '@/lib/logger';
import { githubConfig, NOT_CONFIGURED } from '@/lib/change-requests/github';
import { buildIssue, secretsIn, toMarkdown } from '@/lib/change-requests/issue';
import { refineChangeRequest } from '@/lib/change-requests/refine';
import { MANUAL_TRANSITIONS, SpecSchema, type CrStatus, type Spec } from '@/lib/change-requests/schema';

export const SUBMIT_TOOL = 'change_request_submit';

interface CrRow {
  id: string; userId: string; title: string; body: string; status: string; spec: unknown; risk: string | null;
  approvalId: string | null; githubIssueUrl: string | null; githubIssueNumber: number | null; createdAt: Date; updatedAt: Date;
}

export function toView(r: CrRow) {
  return {
    id: r.id, title: r.title, body: r.body, status: r.status, spec: r.spec ?? null, risk: r.risk,
    githubIssueUrl: r.githubIssueUrl, githubIssueNumber: r.githubIssueNumber,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export async function getChangeRequest(userId: string, id: string): Promise<CrRow | null> {
  if (!userId) throw new Error('change-requests: userId is required');
  return (await prisma.changeRequest.findFirst({ where: { id, userId } })) as CrRow | null;
}

export async function listChangeRequests(userId: string, take = 100) {
  if (!userId) throw new Error('change-requests: userId is required');
  const rows = (await prisma.changeRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(1, take), 200) })) as CrRow[];
  return rows.map(toView);
}

export async function createChangeRequest(userId: string, input: { title: string; body: string }) {
  return runGuarded(
    { userId, capability: 'change_request_create', permissionClass: 'A', action: 'change_request_created', summary: `titleLength=${input.title.length} bodyLength=${input.body.length}` },
    async () => toView((await prisma.changeRequest.create({ data: { userId, title: input.title, body: input.body, status: 'DRAFT' } })) as CrRow),
  );
}

export type EditOutcome = { kind: 'ok'; value: ReturnType<typeof toView> } | { kind: 'conflict' };

/** Edit only while DRAFT or REFINED. An edit to a refined request voids the spec: it must be refined again. */
export async function updateChangeRequest(userId: string, id: string, patch: { title?: string; body?: string }) {
  const existing = await getChangeRequest(userId, id);
  if (!existing) return null;
  return runGuarded(
    { userId, capability: 'change_request_update', permissionClass: 'A', action: 'change_request_updated', summary: `crId=${id} fields=${Object.keys(patch).join(',')}` },
    async (): Promise<EditOutcome> => {
      const res = await prisma.changeRequest.updateMany({
        where: { id, userId, status: { in: ['DRAFT', 'REFINED'] } },
        data: { ...patch, status: 'DRAFT', spec: Prisma.DbNull, risk: null },
      });
      if (res.count !== 1) return { kind: 'conflict' };
      const row = await getChangeRequest(userId, id);
      return row ? { kind: 'ok', value: toView(row) } : { kind: 'conflict' };
    },
  );
}

export type RefineResult =
  | { kind: 'ok'; value: ReturnType<typeof toView> }
  | { kind: 'conflict' }
  | { kind: 'unavailable'; reason: 'no_model' | 'model_error' | 'invalid_output'; error: string };

export async function refine(userId: string, id: string) {
  const existing = await getChangeRequest(userId, id);
  if (!existing) return null;
  return runGuarded(
    { userId, capability: 'change_request_refine', permissionClass: 'A', action: 'change_request_refined', summary: `crId=${id}` },
    async (): Promise<RefineResult> => {
      if (existing.status !== 'DRAFT' && existing.status !== 'REFINED') return { kind: 'conflict' };
      const out = await refineChangeRequest({ title: existing.title, body: existing.body });
      if (!out.ok) return { kind: 'unavailable', reason: out.reason, error: out.error };
      const risk = out.spec.touchesSecurityOrMoney ? 'security_or_money' : 'standard';
      // The edit may have raced the model call: only write if title and body are unchanged.
      const res = await prisma.changeRequest.updateMany({
        where: { id, userId, status: { in: ['DRAFT', 'REFINED'] }, title: existing.title, body: existing.body },
        data: { spec: out.spec as object, risk, status: 'REFINED' },
      });
      if (res.count !== 1) return { kind: 'conflict' };
      const row = await getChangeRequest(userId, id);
      return row ? { kind: 'ok', value: toView(row) } : { kind: 'conflict' };
    },
  );
}

export type SubmitResult =
  | { ok: true; status: 202; approval: ApprovalView; githubConfigured: true }
  | { ok: true; status: 200; githubConfigured: false; message: string; exportUrl: string }
  | { ok: false; status: 404 | 409 | 422 | 500; error: string };

export async function submit(userId: string, id: string): Promise<SubmitResult> {
  const cr = await getChangeRequest(userId, id);
  if (!cr) return { ok: false, status: 404, error: 'Not found' };
  if (!['REFINED', 'AWAITING_APPROVAL', 'FAILED'].includes(cr.status)) return { ok: false, status: 409, error: `Cannot submit a request in status ${cr.status}` };
  const parsed = SpecSchema.safeParse(cr.spec);
  if (!parsed.success) return { ok: false, status: 409, error: 'Refine the request before submitting' };
  const spec: Spec = parsed.data;
  const correlationId = generateCorrelationId();
  const issue = buildIssue({ title: cr.title, body: cr.body, spec });

  const leaked = secretsIn(`${issue.title}\n${issue.body}`);
  if (leaked.length > 0) {
    await recordActionSafe({ userId, initiator: 'user', persona: 'WHINK', tool: SUBMIT_TOOL, action: 'change_request_submit_blocked', permissionClass: 'C', status: 'DENIED', outputSummary: `secret pattern found (${leaked.join(',')}); nothing sent`, inputSummary: `crId=${id}`, correlationId });
    return { ok: false, status: 422, error: 'The request looks like it contains a secret. Remove it before submitting.' };
  }

  const cfg = githubConfig();
  if (!cfg) {
    await prisma.changeRequest.updateMany({ where: { id, userId, status: { in: ['REFINED', 'AWAITING_APPROVAL', 'FAILED'] } }, data: { status: 'AWAITING_APPROVAL' } });
    await recordActionSafe({ userId, initiator: 'user', persona: 'WHINK', tool: SUBMIT_TOOL, action: 'change_request_submit_unconfigured', permissionClass: 'C', status: 'DENIED', outputSummary: 'GitHub not configured; no approval created', inputSummary: `crId=${id}`, correlationId });
    return { ok: true, status: 200, githubConfigured: false, message: NOT_CONFIGURED, exportUrl: `/api/change-requests/${id}/export` };
  }

  const params = { changeRequestId: id, repo: cfg.repo, title: issue.title, body: issue.body };
  try {
    // The engine always answers "needs approval" for this protected tool; a downgrade is refused there.
    const perm = await checkPermission(userId, SUBMIT_TOOL, 'C', correlationId, { params });
    if (perm.allowed) return { ok: false, status: 500, error: 'Permission engine misconfigured; nothing sent' };
    const approval = await createApproval({
      userId, kind: 'tool_call', tool: SUBMIT_TOOL, params, correlationId,
      summary: `Send GitHub issue to ${cfg.repo}: ${issue.title}`.substring(0, 300),
    });
    await prisma.changeRequest.updateMany({ where: { id, userId, status: { in: ['REFINED', 'AWAITING_APPROVAL', 'FAILED'] } }, data: { status: 'AWAITING_APPROVAL', approvalId: approval.id } });
    await recordActionSafe({ userId, initiator: 'user', persona: 'WHINK', tool: SUBMIT_TOOL, action: 'change_request_submit_requested', permissionClass: 'C', status: 'AWAITING_APPROVAL', inputSummary: `crId=${id} repo=${cfg.repo}`, validationResult: JSON.stringify({ approvalId: approval.id }), protectedCategory: 'proprietary', correlationId });
    return { ok: true, status: 202, approval, githubConfigured: true };
  } catch (e) {
    logger.error('change request approval failed', { userId, error: (e as Error)?.message });
    return { ok: false, status: 500, error: 'Could not queue approval; nothing sent' };
  }
}

export type StatusOutcome = { kind: 'ok'; value: ReturnType<typeof toView> } | { kind: 'conflict'; error: string };

export async function setStatus(userId: string, id: string, next: CrStatus) {
  const existing = await getChangeRequest(userId, id);
  if (!existing) return null;
  return runGuarded(
    { userId, capability: 'change_request_status', permissionClass: 'A', action: 'change_request_status_set', summary: `crId=${id} ${existing.status}->${next}` },
    async (): Promise<StatusOutcome> => {
      const allowed = MANUAL_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(next)) return { kind: 'conflict', error: `Cannot move from ${existing.status} to ${next}` };
      const res = await prisma.changeRequest.updateMany({ where: { id, userId, status: existing.status }, data: { status: next } });
      if (res.count !== 1) return { kind: 'conflict', error: 'Status changed meanwhile' };
      const row = await getChangeRequest(userId, id);
      return row ? { kind: 'ok', value: toView(row) } : { kind: 'conflict', error: 'Not found' };
    },
  );
}

/** Markdown for the owner's own browser. Not protected: it never leaves the account. */
export async function exportMarkdown(userId: string, id: string): Promise<string | null> {
  const cr = await getChangeRequest(userId, id);
  if (!cr) return null;
  const spec = SpecSchema.safeParse(cr.spec);
  const md = toMarkdown({ title: cr.title, body: cr.body, spec: spec.success ? spec.data : null, risk: cr.risk });
  await recordActionSafe({ userId, initiator: 'user', persona: 'WHINK', tool: 'change_request_download', action: 'change_request_downloaded', permissionClass: 'A', status: 'VALIDATED', inputSummary: `crId=${id} bytes=${md.length}`, correlationId: generateCorrelationId() });
  return md;
}

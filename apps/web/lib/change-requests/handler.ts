/**
 * Runs AFTER the owner approved a change_request_submit request (called by the tool registry's
 * approved path only; the permission engine, hash lock and exactly-once claim already happened).
 * The issue is rebuilt from the STORED spec and must equal what was approved, byte for byte.
 * No model is called. The GitHub token never leaves lib/change-requests/github.ts.
 */
import { prisma } from '@/lib/db';
import { recordActionSafe } from '@/lib/ledger';
import { createIssue, githubConfig, NOT_CONFIGURED } from '@/lib/change-requests/github';
import { buildIssue } from '@/lib/change-requests/issue';
import { SpecSchema } from '@/lib/change-requests/schema';

export interface SubmitHandlerResult { success: boolean; data?: unknown; error?: string }

export async function runApprovedSubmit(userId: string, params: unknown): Promise<SubmitHandlerResult> {
  const p = (params ?? {}) as { changeRequestId?: unknown; repo?: unknown; title?: unknown; body?: unknown };
  if (typeof p.changeRequestId !== 'string' || typeof p.title !== 'string' || typeof p.body !== 'string' || typeof p.repo !== 'string') {
    return { success: false, error: 'Invalid approved content; not sent' };
  }
  const id = p.changeRequestId;
  const cr = await prisma.changeRequest.findFirst({ where: { id, userId } });
  if (!cr) return { success: false, error: 'Change request not found' };
  if (cr.status !== 'AWAITING_APPROVAL') return { success: false, error: `Change request is ${cr.status}, not awaiting approval; not sent` };
  const spec = SpecSchema.safeParse(cr.spec);
  if (!spec.success) return { success: false, error: 'Change request has no valid spec; not sent' };
  const issue = buildIssue({ title: cr.title, body: cr.body, spec: spec.data });
  if (issue.title !== p.title || issue.body !== p.body) {
    return { success: false, error: 'Change request changed since approval; not sent' };
  }
  if (!githubConfig()) return { success: false, error: NOT_CONFIGURED };

  // Claim before the network call so two approvals for one request cannot both create an issue.
  const claim = await prisma.changeRequest.updateMany({ where: { id, userId, status: 'AWAITING_APPROVAL' }, data: { status: 'SENT' } });
  if (claim.count !== 1) return { success: false, error: 'Change request already sent' };

  const res = await createIssue({ title: issue.title, body: issue.body, expectRepo: p.repo });
  if (!res.ok) {
    // Nothing reached GitHub; put it back so it can be resubmitted.
    await prisma.changeRequest.updateMany({ where: { id, userId, status: 'SENT' }, data: { status: 'FAILED' } });
    await recordActionSafe({ userId, initiator: 'user', persona: 'WHINK', tool: 'change_request_submit', action: 'change_request_send_failed', permissionClass: 'C', status: 'FAILED', outputSummary: res.error, inputSummary: `crId=${id}`, protectedCategory: 'proprietary' });
    return { success: false, error: res.error };
  }
  await prisma.changeRequest.updateMany({ where: { id, userId, status: 'SENT' }, data: { githubIssueUrl: res.url, githubIssueNumber: res.number } });
  await recordActionSafe({ userId, initiator: 'user', persona: 'WHINK', tool: 'change_request_submit', action: 'change_request_sent', permissionClass: 'C', status: 'EXECUTED', outputSummary: `issue #${res.number}`, inputSummary: `crId=${id} repo=${p.repo}`, protectedCategory: 'proprietary' });
  return { success: true, data: { changeRequestId: id, issueUrl: res.url, issueNumber: res.number } };
}

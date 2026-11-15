/**
 * On-demand email briefing to the user's OWN account email. Same gate as the SMS briefing: protected (Class C,
 * proprietary), approval by request id inside 30 s, hash-locked, once. This module only builds the text and the
 * approval; the send runs from runApprovedEmailBriefing via lib/tool-registry.ts.
 */
import { prisma } from '@/lib/db';
import { createApproval, type ApprovalView } from '@/lib/approvals';
import { recordActionSafe } from '@/lib/ledger';
import { generateCorrelationId, logger } from '@/lib/logger';
import { deliver } from '@/lib/comms/delivery';
import { buildSmsBriefing, sha256 } from '@/lib/briefing/sms';

export const EMAIL_BRIEFING_TOOL = 'email_briefing_send';
const SUBJECT = 'Your daily briefing';

export function maskEmail(e: string): string {
  const [u = '', d = ''] = e.split('@');
  return `${u.slice(0, 1)}***@${d}`;
}

async function ownEmail(userId: string): Promise<{ address: string; timeZone: string } | null> {
  const [user, pref] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.notificationPreference.findFirst({ where: { userId }, select: { timeZone: true } }),
  ]);
  if (!user?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) return null;
  return { address: user.email, timeZone: pref?.timeZone || 'America/Edmonton' };
}

export type EmailBriefingRequest =
  | { ok: true; approvalId: string; approval: ApprovalView; preview: string }
  | { ok: false; status: 400; error: 'no_email' };

export async function requestEmailBriefing(userId: string, now: Date = new Date()): Promise<EmailBriefingRequest> {
  const dest = await ownEmail(userId);
  if (!dest) return { ok: false, status: 400, error: 'no_email' };
  const text = await buildSmsBriefing(userId, dest.timeZone, now);
  const correlationId = generateCorrelationId();
  const approval = await createApproval({
    userId, kind: 'tool_call', tool: EMAIL_BRIEFING_TOOL, params: { to: dest.address, subject: SUBJECT, text, textHash: sha256(text) }, correlationId,
    summary: `Email briefing to ${maskEmail(dest.address)} (${text.length} chars)`,
  });
  await recordActionSafe({
    userId, initiator: 'user', persona: 'WHINK', tool: EMAIL_BRIEFING_TOOL, action: 'email_briefing_requested',
    permissionClass: 'C', status: 'AWAITING_APPROVAL', protectedCategory: 'proprietary',
    inputSummary: `to ${maskEmail(dest.address)}, ${text.length} chars`,
    validationResult: JSON.stringify({ approvalId: approval.id, category: 'proprietary' }), correlationId,
  });
  return { ok: true, approvalId: approval.id, approval, preview: text };
}

export async function runApprovedEmailBriefing(
  userId: string,
  params: unknown,
  ctx: { correlationId?: string; persona?: string } = {},
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const p = (params ?? {}) as { to?: unknown; subject?: unknown; text?: unknown; textHash?: unknown };
  const base = {
    userId, initiator: 'user' as const, persona: ctx.persona ?? 'WHINK', tool: EMAIL_BRIEFING_TOOL,
    permissionClass: 'C', protectedCategory: 'proprietary' as const, correlationId: ctx.correlationId,
  };
  if (typeof p.to !== 'string' || typeof p.text !== 'string' || typeof p.textHash !== 'string' || sha256(p.text) !== p.textHash) {
    await recordActionSafe({ ...base, action: 'email_briefing_refused', status: 'FAILED', outputSummary: 'stored briefing content failed its hash check; not sent' });
    return { success: false, error: 'Briefing content no longer matches; not sent' };
  }
  const dest = await ownEmail(userId);
  if (!dest || dest.address !== p.to) {
    await recordActionSafe({ ...base, action: 'email_briefing_refused', status: 'FAILED', outputSummary: 'account email changed since approval; not sent' });
    return { success: false, error: 'Your account email changed since approval; not sent' };
  }
  const r = await deliver({ userId, channel: 'EMAIL', to: p.to, subject: SUBJECT, body: p.text });
  if (r.sent) {
    await recordActionSafe({ ...base, action: 'email_briefing_sent', status: 'VALIDATED', confirmationMethod: 'user_confirmed', inputSummary: `to ${maskEmail(p.to)}`, outputSummary: r.messageId ? 'accepted by SMTP' : 'accepted' });
    return { success: true, data: { sent: true } };
  }
  const reason = r.reason ?? 'unknown';
  await recordActionSafe({ ...base, action: 'email_briefing_failed', status: 'FAILED', confirmationMethod: 'user_confirmed', inputSummary: `to ${maskEmail(p.to)}`, outputSummary: reason });
  logger.warn('email briefing not sent', { reason });
  return { success: false, error: r.unknownOutcome ? 'unknown outcome: it may or may not have been delivered. Not retried; check your inbox first' : `not sent: ${reason}` };
}

/**
 * On-demand SMS briefing. Sending is a PROTECTED action (sms_briefing_send, Class C, proprietary):
 * this module only builds the text and creates the approval. The send happens in
 * runApprovedSmsBriefing, reached only from lib/tool-registry.ts after the owner approved the
 * exact request id inside 30 s and the stored content still matches its hash.
 *
 * The destination is the user's OWN number from NotificationPreference. No standing approval,
 * no delegation and no "own number" exemption exists: every send needs its own approval.
 * The text carries no financial figures and no client or counterparty names.
 */
import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { createApproval, type ApprovalView } from '@/lib/approvals';
import { recordActionSafe } from '@/lib/ledger';
import { countSecurityEvents } from '@/lib/ledger';
import { generateCorrelationId, logger } from '@/lib/logger';
import { deliver, isSmsE164, maskPhone, cleanSmsBody } from '@/lib/comms/delivery';
import { listAccessibleProjects, statsForProjects } from '@/lib/project-cards';

export const SMS_BRIEFING_TOOL = 'sms_briefing_send';
export const BRIEFING_MAX_CHARS = 600;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** One line, no control characters, capped. */
function line(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function getOwnSmsNumber(userId: string): Promise<{ address: string; timeZone: string } | null> {
  const pref = await prisma.notificationPreference.findFirst({ where: { userId, channel: 'SMS' }, select: { address: true, timeZone: true } });
  if (!pref || !isSmsE164(pref.address)) return null;
  return { address: pref.address, timeZone: pref.timeZone || 'America/Edmonton' };
}

export async function buildSmsBriefing(userId: string, timeZone: string, now: Date = new Date()): Promise<string> {
  if (!userId) throw new Error('briefing: userId is required');
  let date: string;
  try {
    date = new Intl.DateTimeFormat('en-CA', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(now);
  } catch {
    date = now.toISOString().slice(0, 10);
  }
  const since = new Date(now.getTime() - 24 * 60 * 60_000);
  const [pending, events, recs, projects] = await Promise.all([
    prisma.approvalRequest.count({ where: { userId, status: 'PENDING', expiresAt: { gt: now } } }),
    countSecurityEvents(userId, since),
    prisma.recommendation.findMany({ where: { userId, dismissedAt: null }, orderBy: { createdAt: 'desc' }, take: 3, select: { title: true } }),
    listAccessibleProjects(userId),
  ]);
  const secCount = Object.values(events).reduce((a, b) => a + b, 0);
  const active = projects.filter((p) => p.status === 'ACTIVE').slice(0, 3);
  const stats = await statsForProjects(active.map((p) => p.id));

  const parts = [
    `WHINK briefing ${line(date, 24)}`,
    `Approvals pending: ${pending}. Security events (24h): ${secCount}.`,
    recs.length ? `Recommendations: ${recs.map((r) => line(r.title, 50)).join('; ')}.` : 'Recommendations: none.',
    active.length ? `Projects: ${active.map((p) => `${line(p.name, 30)} ${stats.get(p.id)?.percent ?? 0}%`).join(', ')}.` : 'Projects: none active.',
  ];
  const text = parts.join('\n');
  return text.length > BRIEFING_MAX_CHARS ? text.slice(0, BRIEFING_MAX_CHARS - 3) + '...' : text;
}

export type SmsBriefingRequest =
  | { ok: true; approvalId: string; approval: ApprovalView; preview: string }
  | { ok: false; status: 400; error: 'no_sms_number' };

export async function requestSmsBriefing(userId: string, now: Date = new Date()): Promise<SmsBriefingRequest> {
  const dest = await getOwnSmsNumber(userId);
  if (!dest) return { ok: false, status: 400, error: 'no_sms_number' };
  const text = cleanSmsBody(await buildSmsBriefing(userId, dest.timeZone, now));
  const correlationId = generateCorrelationId();
  const params = { to: dest.address, text, textHash: sha256(text) };
  const approval = await createApproval({
    userId, kind: 'tool_call', tool: SMS_BRIEFING_TOOL, params, correlationId,
    // The ledger keeps only a masked summary; the card shows the exact number and text from the stored params.
    summary: `Send SMS briefing to ${maskPhone(dest.address)} (${text.length} chars)`,
  });
  await recordActionSafe({
    userId, initiator: 'user', persona: 'WHINK', tool: SMS_BRIEFING_TOOL, action: 'sms_briefing_requested',
    permissionClass: 'C', status: 'AWAITING_APPROVAL', protectedCategory: 'proprietary',
    inputSummary: `to ${maskPhone(dest.address)}, ${text.length} chars`,
    validationResult: JSON.stringify({ approvalId: approval.id, category: 'proprietary' }), correlationId,
  });
  return { ok: true, approvalId: approval.id, approval, preview: text };
}

/**
 * Runs ONLY from an approved, hash-matching request (lib/tool-registry.ts executeApprovedTool).
 * Re-checks the text against its stored hash and the destination against the user's current number.
 */
export async function runApprovedSmsBriefing(
  userId: string,
  params: unknown,
  ctx: { correlationId?: string; persona?: string } = {},
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const p = (params ?? {}) as { to?: unknown; text?: unknown; textHash?: unknown };
  const base = {
    userId, initiator: 'user' as const, persona: ctx.persona ?? 'WHINK', tool: SMS_BRIEFING_TOOL,
    permissionClass: 'C', protectedCategory: 'proprietary' as const, correlationId: ctx.correlationId,
  };
  if (typeof p.to !== 'string' || typeof p.text !== 'string' || typeof p.textHash !== 'string' || sha256(p.text) !== p.textHash) {
    await recordActionSafe({ ...base, action: 'sms_briefing_refused', status: 'FAILED', outputSummary: 'stored briefing content failed its hash check; not sent' });
    return { success: false, error: 'Briefing content no longer matches; not sent' };
  }
  const dest = await getOwnSmsNumber(userId);
  if (!dest || dest.address !== p.to) {
    await recordActionSafe({ ...base, action: 'sms_briefing_refused', status: 'FAILED', outputSummary: 'SMS number changed since approval; not sent' });
    return { success: false, error: 'Your SMS number changed since approval; not sent' };
  }
  const r = await deliver({ userId, channel: 'SMS', to: p.to, body: p.text });
  if (r.sent) {
    await recordActionSafe({ ...base, action: 'sms_briefing_sent', status: 'VALIDATED', confirmationMethod: 'user_confirmed', inputSummary: `to ${maskPhone(p.to)}, ${p.text.length} chars`, outputSummary: r.sid ? `Twilio ${r.sid}` : 'accepted' });
    return { success: true, data: { sent: true, sid: r.sid ?? null } };
  }
  const reason = r.reason ?? 'unknown';
  await recordActionSafe({ ...base, action: 'sms_briefing_failed', status: 'FAILED', confirmationMethod: 'user_confirmed', inputSummary: `to ${maskPhone(p.to)}`, outputSummary: reason });
  logger.warn('sms briefing not sent', { reason });
  const msg = r.unknownOutcome
    ? 'unknown outcome: the request may or may not have been delivered. It was not retried; check your phone before sending again'
    : `not sent: ${reason}`;
  return { success: false, error: msg };
}

/**
 * Called by the automated daily path. NEVER sends. Writes one ledger row and one Recommendation per
 * user per day so the owner can open Today and approve the briefing themselves.
 */
export async function surfaceBriefingWaiting(userId: string, dateKey: string): Promise<'created' | 'already'> {
  const dedupeKey = `sms-briefing:${dateKey}`;
  const existing = await prisma.recommendation.findFirst({ where: { userId, dedupeKey }, select: { id: true } });
  if (existing) return 'already';
  await prisma.recommendation.upsert({
    where: { userId_dedupeKey: { userId, dedupeKey } },
    create: {
      userId, source: 'briefing', kind: 'sms_briefing', severity: 'info', dedupeKey,
      title: 'Your daily briefing is ready',
      body: 'Open Today and tap Send briefing by SMS. Nothing is sent until you approve it.',
      link: '/dashboard',
    },
    update: {},
  });
  await recordActionSafe({
    userId, initiator: 'automation', persona: 'WHINK', tool: SMS_BRIEFING_TOOL, action: 'sms_briefing_waiting_for_approval',
    permissionClass: 'C', status: 'AWAITING_APPROVAL', protectedCategory: 'proprietary',
    outputSummary: 'A briefing is waiting for your approval. Nothing was sent.', correlationId: `sms-briefing:${dateKey}`,
  });
  return 'created';
}

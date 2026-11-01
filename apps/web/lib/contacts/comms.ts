/**
 * Contact messages and calls. REUSES the Class C approval machinery in lib/approvals.ts
 * (30 s expiry, id-bound, hash lock, atomic decision, ledgered). Nothing is sent from here:
 * this module only creates the approval request carrying the exact content and the recipient.
 * After approval, lib/tool-registry.ts runs the contact_message / contact_call handlers, which
 * call lib/comms/delivery.ts.
 *
 * CASL: when WHINK has no prior relationship record for the contact (no earlier comms request),
 * the approval payload carries casl: 'review_consent' so the approver sees it before saying yes.
 */
import { prisma } from '@/lib/db';
import { createApproval, type ApprovalView } from '@/lib/approvals';
import { recordActionSafe } from '@/lib/ledger';
import { generateCorrelationId } from '@/lib/logger';

export const CHANNELS = ['SMS', 'WHATSAPP', 'TELEGRAM', 'EMAIL'] as const;
export type MessageChannel = (typeof CHANNELS)[number];
export const BODY_MAX = 1600;
export const SCRIPT_MAX = 2000;

interface ContactLike { phone: string | null; email: string | null; tags: string[] }

/** Telegram needs a chat id, which a contact does not otherwise have: it is stored as a tag `telegram:<chatId>`. */
export function resolveDestination(c: ContactLike, channel: MessageChannel | 'PHONE_CALL'): string | null {
  switch (channel) {
    case 'SMS':
    case 'WHATSAPP':
    case 'PHONE_CALL':
      return c.phone;
    case 'EMAIL':
      return c.email;
    case 'TELEGRAM': {
      const tag = c.tags.find((t) => /^telegram:-?\d{1,20}$/.test(t));
      return tag ? tag.substring('telegram:'.length) : null;
    }
  }
}

export type CommsRequestResult =
  | { ok: true; approval: ApprovalView; commsRequestId: string; casl: 'review_consent' | 'prior_relationship' }
  | { ok: false; status: 404 | 422; error: string };

async function request(
  userId: string,
  contactId: string,
  kind: 'message' | 'call',
  channel: MessageChannel | 'PHONE_CALL',
  content: { body?: string; script?: string },
): Promise<CommsRequestResult> {
  if (!userId) throw new Error('comms: userId is required');
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } });
  if (!contact) return { ok: false, status: 404, error: 'Not found' };
  const to = resolveDestination(contact, channel);
  if (!to) return { ok: false, status: 422, error: `Contact has no destination for ${channel}` };

  const prior = await prisma.commsRequest.count({ where: { userId, contactId } });
  const casl = prior === 0 ? 'review_consent' as const : 'prior_relationship' as const;
  const correlationId = generateCorrelationId();
  const tool = kind === 'message' ? 'contact_message' : 'contact_call';
  const params = kind === 'message'
    ? { contactId, contactName: contact.name, channel, to, body: content.body ?? '', casl }
    : { contactId, contactName: contact.name, channel, to, script: content.script ?? '', casl };

  const approval = await createApproval({
    userId, kind: 'tool_call', tool, params, correlationId,
    summary: (kind === 'message'
      ? `Send ${channel} to ${contact.name} (${to}): ${content.body ?? ''}`
      : `Call ${contact.name} (${to})${content.script ? `: ${content.script}` : ''}`).substring(0, 300),
  });
  const link = await prisma.commsRequest.create({
    data: { userId, contactId, approvalId: approval.id, kind, channel },
  });
  await recordActionSafe({
    userId, initiator: 'user', persona: 'WHINK', tool, action: 'comms_request_created', permissionClass: 'C',
    status: 'AWAITING_APPROVAL', inputSummary: `contactId=${contactId} channel=${channel} casl=${casl}`,
    validationResult: JSON.stringify({ approvalId: approval.id, commsRequestId: link.id }), correlationId,
  });
  return { ok: true, approval, commsRequestId: link.id, casl };
}

export const requestMessage = (userId: string, contactId: string, channel: MessageChannel, body: string) =>
  request(userId, contactId, 'message', channel, { body });

export const requestCall = (userId: string, contactId: string, script?: string) =>
  request(userId, contactId, 'call', 'PHONE_CALL', { script });

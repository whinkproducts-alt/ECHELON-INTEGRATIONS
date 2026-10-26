// Communication delivery layer.
// Each channel requires external credentials configured as env vars.
// Stubs return { sent: false, reason: 'not_configured' } when credentials are absent.
// Real sends go through the permission engine — Class B (requires delegation).

import { routeRecipient, routingHeaders } from './mail-routing';
import { isOwnerEmail } from '@/lib/owner';

/** True only when the sending user exists and their email is an owner email. Any failure means false. */
async function senderIsOwner(userId: string): Promise<boolean> {
  try {
    const { prisma } = await import('@/lib/db');
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return isOwnerEmail(u?.email);
  } catch {
    return false;
  }
}

export type Channel = 'EMAIL' | 'WHATSAPP' | 'SMS' | 'TELEGRAM' | 'PHONE_CALL';

export interface DeliveryResult {
  sent: boolean;
  channel: Channel;
  reason?: string;
  messageId?: string;
  /** EMAIL only: the address actually used after staff mail routing, and the one asked for. */
  deliveredTo?: string;
  originalTo?: string;
  /** EMAIL only: headers the SMTP sender must add (X-Original-To). */
  headers?: Record<string, string>;
}

export interface DeliveryPayload {
  to: string; // email, E.164 phone, or Telegram chat ID
  subject?: string; // email only
  body: string;
  channel: Channel;
  userId: string; // for ledger and tenant isolation
}

// Email — uses SMTP via nodemailer (MIT licence).
// Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
async function deliverEmail(payload: DeliveryPayload): Promise<DeliveryResult> {
  const route = routeRecipient(payload.to, { senderIsOwner: await senderIsOwner(payload.userId) });
  if (!route.valid) return { sent: false, channel: 'EMAIL', reason: 'invalid_recipient' };
  const info = { deliveredTo: route.deliverTo, originalTo: route.original, headers: routingHeaders(route) };
  if (!process.env.SMTP_HOST) return { sent: false, channel: 'EMAIL', reason: 'not_configured', ...info };
  // Real implementation: import nodemailer and send to route.deliverTo with
  // info.headers (X-Original-To). Placeholder returns configured.
  return { sent: false, channel: 'EMAIL', reason: 'smtp_not_implemented_yet', ...info };
}

// SMS / WhatsApp / Phone — uses Twilio.
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_WHATSAPP_FROM
async function deliverTwilio(payload: DeliveryPayload): Promise<DeliveryResult> {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return { sent: false, channel: payload.channel, reason: 'not_configured' };
  }
  // Real implementation: call Twilio REST API.
  // SMS: POST /2010-04-01/Accounts/{sid}/Messages.json
  // WhatsApp: same endpoint with 'whatsapp:' prefix on From/To
  // Phone call: POST /2010-04-01/Accounts/{sid}/Calls.json with TwiML body
  return { sent: false, channel: payload.channel, reason: 'twilio_not_implemented_yet' };
}

// Telegram — uses Bot API.
// Env: TELEGRAM_BOT_TOKEN
async function deliverTelegram(payload: DeliveryPayload): Promise<DeliveryResult> {
  if (!process.env.TELEGRAM_BOT_TOKEN)
    return { sent: false, channel: 'TELEGRAM', reason: 'not_configured' };
  // Real: POST https://api.telegram.org/bot{token}/sendMessage
  return { sent: false, channel: 'TELEGRAM', reason: 'telegram_not_implemented_yet' };
}

export async function deliver(payload: DeliveryPayload): Promise<DeliveryResult> {
  switch (payload.channel) {
    case 'EMAIL':
      return deliverEmail(payload);
    case 'SMS':
      return deliverTwilio(payload);
    case 'WHATSAPP':
      return deliverTwilio(payload);
    case 'PHONE_CALL':
      return deliverTwilio(payload);
    case 'TELEGRAM':
      return deliverTelegram(payload);
    default:
      return { sent: false, channel: payload.channel, reason: 'unknown_channel' };
  }
}

// ── Outbound to a contact ────────────────────────────────────────────────────
// These run ONLY after a human approved the exact content (Class C approval flow in
// lib/approvals.ts -> tool handlers contact_message / contact_call). They never decide
// permission themselves. Stubs: they return { sent: false, reason: 'not_configured' } unless
// the channel's env is set, and even then the provider call is not built yet.

export type ContactChannel = 'SMS' | 'WHATSAPP' | 'TELEGRAM' | 'EMAIL';

export interface ContactSend {
  userId: string;
  channel: ContactChannel;
  /** Destination resolved from the contact: E.164 phone, email, or Telegram chat id. */
  to: string;
  body: string;
  subject?: string;
}

export async function sendToContact(msg: ContactSend): Promise<DeliveryResult> {
  if (!msg.userId) throw new Error('delivery: userId is required');
  return deliver({ userId: msg.userId, to: msg.to, body: msg.body, subject: msg.subject, channel: msg.channel });
}

export async function placeCall(call: { userId: string; to: string; script?: string }): Promise<DeliveryResult> {
  if (!call.userId) throw new Error('delivery: userId is required');
  return deliver({ userId: call.userId, to: call.to, body: call.script ?? '', channel: 'PHONE_CALL' });
}

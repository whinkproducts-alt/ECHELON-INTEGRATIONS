// Communication delivery layer.
// Each channel requires external credentials configured as env vars.
// SMS is real (Twilio REST). Email, WhatsApp, Telegram and phone calls are still stubs.
// Missing credentials return { sent: false, reason: 'not_configured' }.
// This layer never decides permission: callers run only after the permission engine / an approval
// (sms, email and call sends are protected, Class C, approved by request id).

import { routeRecipient, routingHeaders } from './mail-routing';
import { isOwnerEmail } from '@/lib/owner';
import { logger } from '@/lib/logger';

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
  /** SMS only: Twilio message SID (not a secret) on success. */
  sid?: string;
  /** SMS only: true when the request may or may not have been delivered (timeout, dropped connection). Never retried. */
  unknownOutcome?: boolean;
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

// SMS: real, via the Twilio REST API with the global fetch (no SDK, no dependency).
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.
// WhatsApp and phone calls are still stubs.
const TWILIO_BASE = 'https://api.twilio.com/2010-04-01/Accounts'; // fixed host, never from input
const SMS_TIMEOUT_MS = 10_000;
const SMS_E164 = /^\+[1-9]\d{6,14}$/;
export const SMS_BODY_MAX = 1600;

/** Last two digits only, for logs and the ledger. */
export function maskPhone(n: string): string {
  const d = String(n ?? '').replace(/\D/g, '');
  return d.length >= 2 ? `***${d.slice(-2)}` : '***';
}

export function isSmsE164(n: unknown): n is string {
  return typeof n === 'string' && SMS_E164.test(n);
}

/** Trim and strip control characters (newline and tab kept). Returns '' when nothing usable remains. */
export function cleanSmsBody(body: unknown): string {
  return String(body ?? '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '')
    .trim();
}

function smsReasonFor(status: number, code: unknown): string {
  if (status === 401 || status === 403 || code === 20003 || code === 20005) return 'auth_failed';
  if (status === 429 || code === 20429) return 'rate_limited';
  if (code === 21608) return 'unverified_number_trial';
  if (code === 21211 || code === 21614 || code === 21408 || code === 21217) return 'invalid_number';
  return 'other';
}

async function deliverSms(payload: DeliveryPayload): Promise<DeliveryResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || (!from && !service)) return { sent: false, channel: 'SMS', reason: 'not_configured' };

  if (!isSmsE164(payload.to)) return { sent: false, channel: 'SMS', reason: 'invalid_number' };
  const body = cleanSmsBody(payload.body);
  if (body.length < 1 || body.length > SMS_BODY_MAX) return { sent: false, channel: 'SMS', reason: 'invalid_body' };
  if (!/^AC[0-9a-zA-Z]{20,64}$/.test(sid)) return { sent: false, channel: 'SMS', reason: 'not_configured' };

  const form = new URLSearchParams({ To: payload.to, Body: body });
  if (service) form.set('MessagingServiceSid', service);
  else form.set('From', from as string);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SMS_TIMEOUT_MS);
  const masked = maskPhone(payload.to);
  try {
    // One attempt only. A retry after a timeout could send the message twice.
    const res = await fetch(`${TWILIO_BASE}/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: ctl.signal,
    });
    let json: Record<string, unknown> = {};
    try {
      const parsed: unknown = await res.json();
      if (parsed && typeof parsed === 'object') json = parsed as Record<string, unknown>;
    } catch { /* body not JSON */ }

    if (!res.ok) {
      const reason = smsReasonFor(res.status, json.code);
      logger.error('sms send failed', { status: res.status, code: typeof json.code === 'number' ? json.code : undefined, reason, to: masked });
      return { sent: false, channel: 'SMS', reason };
    }
    const msgSid = typeof json.sid === 'string' && /^(SM|MM)[0-9a-zA-Z]{32}$/.test(json.sid) ? json.sid : undefined;
    return { sent: true, channel: 'SMS', sid: msgSid, messageId: msgSid };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    logger.error('sms send outcome unknown', { error: aborted ? 'timeout' : (e as Error)?.name, to: masked });
    return { sent: false, channel: 'SMS', reason: 'unknown_outcome', unknownOutcome: true };
  } finally {
    clearTimeout(timer);
  }
}

// WhatsApp / Phone — Twilio, not built yet.
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
async function deliverTwilio(payload: DeliveryPayload): Promise<DeliveryResult> {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return { sent: false, channel: payload.channel, reason: 'not_configured' };
  }
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
      return deliverSms(payload);
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
// the channel's env is set. SMS really sends; the other channels' provider calls are not built yet.

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

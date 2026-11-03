// Communication delivery layer.
// Each channel requires external credentials configured as env vars.
// Email (SMTP), SMS, WhatsApp and scripted phone calls (Twilio REST) and Telegram (Bot API) are real adapters.
// iMessage has no supported public API: it stays unavailable until an approved Apple-device bridge is chosen.
// Every adapter makes one attempt only; a timeout is reported as an unknown outcome and never retried.
// Missing credentials return { sent: false, reason: 'not_configured' }. Lockdown returns reason 'lockdown'.
// This layer never decides permission: callers run only after the permission engine / an approval
// (sms, email and call sends are protected, Class C, approved by request id).

import { isLocalOnlyMode } from '@/lib/local-only';
import { routeRecipient, routingHeaders } from './mail-routing';
import { isOwnerEmail } from '@/lib/owner';
import { logger } from '@/lib/logger';
import { isLockedDown, ledgerLockdownBlock } from '@/lib/safety/lockdown';

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

export type Channel = 'EMAIL' | 'WHATSAPP' | 'SMS' | 'TELEGRAM' | 'PHONE_CALL' | 'IMESSAGE';

export interface DeliveryResult {
  sent: boolean;
  channel: Channel;
  reason?: string;
  messageId?: string;
  /** Twilio channels: message or call SID (not a secret) on success. */
  sid?: string;
  /** True when the request may or may not have been delivered (timeout, dropped connection). Never retried. */
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
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const port = Number.parseInt(process.env.SMTP_PORT ?? '587', 10);
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { sent: false, channel: 'EMAIL', reason: 'not_configured', ...info };
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: process.env.SMTP_USER?.trim()
        ? { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS ?? '' }
        : undefined,
    });
    const sent = await transporter.sendMail({
      from,
      to: route.deliverTo,
      subject: payload.subject ?? 'WHINK notification',
      text: payload.body,
      headers: info.headers,
    });
    return { sent: true, channel: 'EMAIL', messageId: typeof sent.messageId === 'string' ? sent.messageId : undefined, ...info };
  } catch (error) {
    logger.warn('smtp email delivery failed', { error: error instanceof Error ? error.name : 'unknown' });
    return { sent: false, channel: 'EMAIL', reason: 'delivery_failed', ...info };
  }
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

/** Twilio account credentials, or null when missing or malformed. */
function twilioAuth(): { sid: string; token: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token || !/^AC[0-9a-zA-Z]{20,64}$/.test(sid)) return null;
  return { sid, token };
}

/**
 * One POST to a Twilio REST resource (Messages.json or Calls.json) on the fixed Twilio host. One attempt only:
 * a retry after a timeout could send twice. Returns the parsed JSON or an unknown outcome.
 */
async function twilioPost(
  auth: { sid: string; token: string }, resource: 'Messages.json' | 'Calls.json', form: URLSearchParams, channel: Channel, to: string,
): Promise<{ res: Response; json: Record<string, unknown> } | DeliveryResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SMS_TIMEOUT_MS);
  try {
    const res = await fetch(`${TWILIO_BASE}/${encodeURIComponent(auth.sid)}/${resource}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Basic ${Buffer.from(`${auth.sid}:${auth.token}`).toString('base64')}`,
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
    return { res, json };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    logger.error('twilio send outcome unknown', { channel, error: aborted ? 'timeout' : (e as Error)?.name, to: maskPhone(to) });
    return { sent: false, channel, reason: 'unknown_outcome', unknownOutcome: true };
  } finally {
    clearTimeout(timer);
  }
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

// WhatsApp: Twilio WhatsApp Business sender. Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
// (the enrolled sender, E.164, with or without the whatsapp: prefix). Free-form text is accepted by WhatsApp only
// inside the 24-hour customer-service window; outside it Twilio returns 63016 and a pre-approved template is needed.
export const WHATSAPP_BODY_MAX = 1600;

function whatsappReasonFor(status: number, code: unknown): string {
  if (code === 63016) return 'whatsapp_template_required';
  if (code === 63007 || code === 63015) return 'whatsapp_sender_not_enrolled';
  return smsReasonFor(status, code);
}

async function deliverWhatsApp(payload: DeliveryPayload): Promise<DeliveryResult> {
  const auth = twilioAuth();
  const fromRaw = process.env.TWILIO_WHATSAPP_FROM?.trim().replace(/^whatsapp:/, '');
  if (!auth || !fromRaw || !isSmsE164(fromRaw)) return { sent: false, channel: 'WHATSAPP', reason: 'not_configured' };
  if (!isSmsE164(payload.to)) return { sent: false, channel: 'WHATSAPP', reason: 'invalid_number' };
  const body = cleanSmsBody(payload.body);
  if (body.length < 1 || body.length > WHATSAPP_BODY_MAX) return { sent: false, channel: 'WHATSAPP', reason: 'invalid_body' };
  const r = await twilioPost(auth, 'Messages.json', new URLSearchParams({ To: `whatsapp:${payload.to}`, From: `whatsapp:${fromRaw}`, Body: body }), 'WHATSAPP', payload.to);
  if ('sent' in r) return r;
  if (!r.res.ok) {
    const reason = whatsappReasonFor(r.res.status, r.json.code);
    logger.error('whatsapp send failed', { status: r.res.status, code: typeof r.json.code === 'number' ? r.json.code : undefined, reason, to: maskPhone(payload.to) });
    return { sent: false, channel: 'WHATSAPP', reason };
  }
  // Accepted by Twilio. Delivery to the handset is a later status, not claimed here.
  const msgSid = typeof r.json.sid === 'string' && /^(SM|MM)[0-9a-zA-Z]{32}$/.test(r.json.sid) ? r.json.sid : undefined;
  return { sent: true, channel: 'WHATSAPP', sid: msgSid, messageId: msgSid };
}

// Phone call: Twilio Voice, a scripted one-way call read by Twilio's text-to-speech (inline TwiML <Say>).
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (voice capable), TWILIO_CALL_TIME_LIMIT_SEC
// (optional spend cap, default 120, max 600). This is not a two-way conversation: that needs a signed webhook flow.
export const CALL_SCRIPT_MAX = 1000;

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function callTwiml(script: string): string {
  return `<Response><Say>${xmlEscape(script)}</Say></Response>`;
}

function callTimeLimitSec(): number {
  const n = Number.parseInt(process.env.TWILIO_CALL_TIME_LIMIT_SEC ?? '', 10);
  return Number.isInteger(n) && n >= 10 && n <= 600 ? n : 120;
}

async function deliverCall(payload: DeliveryPayload): Promise<DeliveryResult> {
  const auth = twilioAuth();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!auth || !from || !isSmsE164(from)) return { sent: false, channel: 'PHONE_CALL', reason: 'not_configured' };
  if (!isSmsE164(payload.to)) return { sent: false, channel: 'PHONE_CALL', reason: 'invalid_number' };
  const script = cleanSmsBody(payload.body).replace(/\s+/g, ' ');
  if (script.length < 1 || script.length > CALL_SCRIPT_MAX) return { sent: false, channel: 'PHONE_CALL', reason: 'invalid_body' };
  const form = new URLSearchParams({ To: payload.to, From: from, Twiml: callTwiml(script), TimeLimit: String(callTimeLimitSec()) });
  const r = await twilioPost(auth, 'Calls.json', form, 'PHONE_CALL', payload.to);
  if ('sent' in r) return r;
  if (!r.res.ok) {
    const reason = smsReasonFor(r.res.status, r.json.code);
    logger.error('call create failed', { status: r.res.status, code: typeof r.json.code === 'number' ? r.json.code : undefined, reason, to: maskPhone(payload.to) });
    return { sent: false, channel: 'PHONE_CALL', reason };
  }
  // The call is queued at Twilio. Whether it was answered is a later status, not claimed here.
  const callSid = typeof r.json.sid === 'string' && /^CA[0-9a-zA-Z]{32}$/.test(r.json.sid) ? r.json.sid : undefined;
  return { sent: true, channel: 'PHONE_CALL', sid: callSid, messageId: callSid };
}

// Telegram: Bot API sendMessage on the fixed api.telegram.org host. Env: TELEGRAM_BOT_TOKEN.
// The token sits in the URL path, so it is never logged; errors log only their kind.
const TELEGRAM_BASE = 'https://api.telegram.org'; // fixed host, never from input
export const TELEGRAM_BODY_MAX = 4096;
const TELEGRAM_TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;

export function isTelegramChatId(v: unknown): v is string {
  return typeof v === 'string' && (/^-?\d{1,20}$/.test(v) || /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v));
}

function telegramReasonFor(status: number, description: string): string {
  if (status === 401 || status === 404) return 'auth_failed';
  if (status === 429) return 'rate_limited';
  if (status === 403) return 'recipient_blocked';
  if (status === 400 && /chat not found/i.test(description)) return 'invalid_recipient';
  return 'other';
}

async function deliverTelegram(payload: DeliveryPayload): Promise<DeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !TELEGRAM_TOKEN.test(token)) return { sent: false, channel: 'TELEGRAM', reason: 'not_configured' };
  if (!isTelegramChatId(payload.to)) return { sent: false, channel: 'TELEGRAM', reason: 'invalid_recipient' };
  const text = cleanSmsBody(payload.body);
  if (text.length < 1 || text.length > TELEGRAM_BODY_MAX) return { sent: false, channel: 'TELEGRAM', reason: 'invalid_body' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SMS_TIMEOUT_MS);
  try {
    // One attempt only. No parse_mode, so the text is sent literally and cannot inject formatting or links previews.
    const res = await fetch(`${TELEGRAM_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: payload.to, text, disable_web_page_preview: true }),
      signal: ctl.signal,
    });
    let json: { ok?: unknown; description?: unknown; result?: { message_id?: unknown } } = {};
    try { json = (await res.json()) ?? {}; } catch { /* body not JSON */ }
    if (!res.ok || json.ok !== true) {
      const reason = telegramReasonFor(res.status, typeof json.description === 'string' ? json.description : '');
      logger.error('telegram send failed', { status: res.status, reason });
      return { sent: false, channel: 'TELEGRAM', reason };
    }
    const id = typeof json.result?.message_id === 'number' ? String(json.result.message_id) : undefined;
    return { sent: true, channel: 'TELEGRAM', messageId: id };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    logger.error('telegram send outcome unknown', { error: aborted ? 'timeout' : (e as Error)?.name });
    return { sent: false, channel: 'TELEGRAM', reason: 'unknown_outcome', unknownOutcome: true };
  } finally {
    clearTimeout(timer);
  }
}

// iMessage: Apple offers no public sending API. A supported Apple-device bridge, its terms and the account it
// would use are an open Founder decision (R06). Until one is chosen and verified this channel is unavailable and
// never silently replaced by SMS.
export const IMESSAGE_UNAVAILABLE = 'imessage_bridge_unavailable';
async function deliverIMessage(): Promise<DeliveryResult> {
  return { sent: false, channel: 'IMESSAGE', reason: IMESSAGE_UNAVAILABLE };
}

/** Which channels have credentials configured on the server. Presence only, never values. */
export function channelConfiguration(): Record<Channel, { configured: boolean; note: string }> {
  const tw = twilioAuth() !== null;
  const waFrom = process.env.TWILIO_WHATSAPP_FROM?.trim().replace(/^whatsapp:/, '') ?? '';
  return {
    EMAIL: { configured: Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim()), note: 'SMTP' },
    SMS: { configured: tw && Boolean(process.env.TWILIO_FROM_NUMBER?.trim() || process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()), note: 'Twilio Messaging' },
    WHATSAPP: { configured: tw && isSmsE164(waFrom), note: 'Twilio WhatsApp sender; templates needed outside the 24-hour window' },
    TELEGRAM: { configured: TELEGRAM_TOKEN.test(process.env.TELEGRAM_BOT_TOKEN?.trim() ?? ''), note: 'Telegram Bot API' },
    PHONE_CALL: { configured: tw && isSmsE164(process.env.TWILIO_FROM_NUMBER?.trim() ?? ''), note: `Twilio Voice, scripted one-way, ${callTimeLimitSec()} s cap` },
    IMESSAGE: { configured: false, note: 'No approved Apple-device bridge selected' },
  };
}

export async function deliver(payload: DeliveryPayload): Promise<DeliveryResult> {
  // Local-Only: email, SMS, WhatsApp, Telegram, iMessage and calls all leave the machine.
  if (isLocalOnlyMode()) return { sent: false, channel: payload.channel, reason: 'local_only' };
  // R07: lockdown is checked here, immediately before any provider I/O, whatever approved the send earlier.
  if (await isLockedDown(payload.userId)) {
    await ledgerLockdownBlock(payload.userId, `deliver:${payload.channel}`);
    return { sent: false, channel: payload.channel, reason: 'lockdown' };
  }
  switch (payload.channel) {
    case 'EMAIL':
      return deliverEmail(payload);
    case 'SMS':
      return deliverSms(payload);
    case 'WHATSAPP':
      return deliverWhatsApp(payload);
    case 'PHONE_CALL':
      return deliverCall(payload);
    case 'TELEGRAM':
      return deliverTelegram(payload);
    case 'IMESSAGE':
      return deliverIMessage();
    default:
      return { sent: false, channel: payload.channel, reason: 'unknown_channel' };
  }
}

// ── Outbound to a contact ────────────────────────────────────────────────────
// These run ONLY after a human approved the exact content (Class C approval flow in
// lib/approvals.ts -> tool handlers contact_message / contact_call). They never decide
// permission themselves. They return { sent: false, reason: 'not_configured' } unless the channel's env is set.

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

/**
 * Twilio SMS adapter. Outbound only. The only file that knows Twilio's transport.
 *
 * Plain fetch against the Twilio REST API, so no SDK and no new dependency licence to check.
 * Replace this file to change SMS provider; callers use sendSms and SmsResult only.
 *
 * Rules kept here:
 * - Credentials come from env at call time. Nothing is hardcoded.
 * - Never throws. Every failure is a typed result so a Twilio outage cannot crash a caller.
 * - The auth token and full phone numbers are never logged or returned.
 * - Twilio's response is untrusted: only sid, status and error code are read, and the
 *   error text is length capped and stripped of long digit runs before it is logged.
 * - Redirects are refused so the Authorization header can never follow one.
 */

import { logger } from '@/lib/logger';

export type SmsFailureReason = 'not_configured' | 'invalid_number' | 'twilio_error' | 'network';

export type SmsResult =
  | { ok: true; sid: string; status: string }
  | { ok: false; reason: SmsFailureReason; code?: number; message: string };

export interface SendSmsInput {
  to: string;
  body: string;
}

export interface SendSmsDeps {
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

const E164 = /^\+[1-9]\d{7,14}$/;
const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;
const TWILIO_HOST = 'https://api.twilio.com/2010-04-01/Accounts';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 1600; // Twilio's own limit for one request.
const MAX_ERROR_CHARS = 200;

export function isE164(n: string): boolean {
  return E164.test(n);
}

/** Last two digits only, for logs and the ledger. */
export function maskNumber(n: string): string {
  const digits = n.replace(/\D/g, '');
  return digits.length >= 2 ? `***${digits.slice(-2)}` : '***';
}

/** Remove digit runs of 7 or more (phone numbers, ids) and cap length. */
function safeText(s: unknown): string {
  const t = typeof s === 'string' ? s : '';
  return t.replace(/\+?\d[\d\s().]{5,}\d/g, '[number]').replace(/[\r\n]+/g, ' ').slice(0, MAX_ERROR_CHARS);
}

export function twilioConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER &&
    ACCOUNT_SID.test(env.TWILIO_ACCOUNT_SID) && E164.test(env.TWILIO_FROM_NUMBER),
  );
}

export async function sendSms(input: SendSmsInput, deps: SendSmsDeps = {}): Promise<SmsResult> {
  const env = deps.env ?? process.env;
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return { ok: false, reason: 'not_configured', message: 'Twilio credentials are not set' };
  }
  if (!ACCOUNT_SID.test(sid) || !E164.test(from)) {
    return { ok: false, reason: 'not_configured', message: 'TWILIO_ACCOUNT_SID or TWILIO_FROM_NUMBER is malformed' };
  }
  if (!E164.test(input.to)) {
    return { ok: false, reason: 'invalid_number', message: 'Recipient must be in E.164 format, for example +14035550123' };
  }
  if (!input.body || input.body.length > MAX_BODY_CHARS) {
    return { ok: false, reason: 'twilio_error', message: `Body must be 1 to ${MAX_BODY_CHARS} characters` };
  }

  const doFetch = deps.fetch ?? fetch;
  try {
    const res = await doFetch(`${TWILIO_HOST}/${sid}/Messages.json`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: input.to, From: from, Body: input.body }).toString(),
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    let json: Record<string, unknown> = {};
    try {
      const parsed: unknown = await res.json();
      if (parsed && typeof parsed === 'object') json = parsed as Record<string, unknown>;
    } catch {
      // Non JSON body: handled below by status.
    }

    if (!res.ok) {
      const code = typeof json.code === 'number' ? json.code : undefined;
      const message = safeText(json.message) || `HTTP ${res.status}`;
      logger.error('twilio send failed', { status: res.status, code, to: maskNumber(input.to) });
      return { ok: false, reason: 'twilio_error', code, message };
    }

    const msgSid = typeof json.sid === 'string' && /^(SM|MM)[0-9a-fA-F]{32}$/.test(json.sid) ? json.sid : null;
    if (!msgSid) {
      logger.error('twilio send returned no message sid', { to: maskNumber(input.to) });
      return { ok: false, reason: 'twilio_error', message: 'Twilio response had no message sid' };
    }
    const status = typeof json.status === 'string' ? json.status.slice(0, 20) : 'unknown';
    return { ok: true, sid: msgSid, status };
  } catch (e) {
    const name = (e as Error)?.name;
    logger.error('twilio unreachable', { error: name === 'TimeoutError' ? 'timeout' : name, to: maskNumber(input.to) });
    return { ok: false, reason: 'network', message: name === 'TimeoutError' ? 'Twilio request timed out' : 'Twilio could not be reached' };
  }
}

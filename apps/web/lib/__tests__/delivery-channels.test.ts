/** R06: WhatsApp, phone call, Telegram and iMessage adapters with mocked fetch. One attempt, fixed hosts, no secrets in logs. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SID = 'AC' + 'a'.repeat(32);
const TOKEN = 'super-secret-auth-token-xyz';
const BOT = '123456789:' + 'S'.repeat(35);
const TO = '+14035550123';
const logs: unknown[][] = [];
const fetchMock = vi.fn();
const KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_MESSAGING_SERVICE_SID', 'TWILIO_WHATSAPP_FROM', 'TELEGRAM_BOT_TOKEN', 'TWILIO_CALL_TIME_LIMIT_SEC', 'SMTP_HOST', 'SMTP_FROM'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  logs.length = 0;
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM_NUMBER: '+15005550006', TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886', TELEGRAM_BOT_TOKEN: BOT });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  const rec = (...a: unknown[]) => { logs.push(a); };
  vi.doMock('@/lib/logger', () => ({ logger: { info: rec, warn: rec, error: rec, debug: rec, security: rec } }));
  vi.doMock('@/lib/db', () => ({ prisma: {} }));
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
});

const send = async (channel: 'WHATSAPP' | 'PHONE_CALL' | 'TELEGRAM' | 'IMESSAGE', to: string, body: string) => {
  const { deliver } = await import('../comms/delivery');
  return deliver({ userId: 'u1', channel, to, body });
};
const noSecretsLogged = () => {
  const text = JSON.stringify(logs);
  expect(text).not.toContain(TOKEN);
  expect(text).not.toContain(BOT);
  expect(text).not.toContain(TO);
};

describe('WhatsApp (Twilio)', () => {
  it('posts once to the fixed Twilio host with whatsapp: addresses', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: 'SM' + 'c'.repeat(32) }) });
    const r = await send('WHATSAPP', TO, 'hello');
    expect(r).toMatchObject({ sent: true, channel: 'WHATSAPP', sid: 'SM' + 'c'.repeat(32) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(init.redirect).toBe('error');
    const form = new URLSearchParams(init.body);
    expect(form.get('To')).toBe(`whatsapp:${TO}`);
    expect(form.get('From')).toBe('whatsapp:+14155238886');
  });
  it('outside the 24-hour window Twilio 63016 is reported as template required', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: 63016 }) });
    expect(await send('WHATSAPP', TO, 'hello')).toMatchObject({ sent: false, reason: 'whatsapp_template_required' });
    noSecretsLogged();
  });
  it('a timeout is an unknown outcome and is not retried', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    expect(await send('WHATSAPP', TO, 'hello')).toMatchObject({ sent: false, reason: 'unknown_outcome', unknownOutcome: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects a non E.164 recipient and a missing sender without a network call', async () => {
    expect((await send('WHATSAPP', '403-555-0123', 'x')).reason).toBe('invalid_number');
    delete process.env.TWILIO_WHATSAPP_FROM;
    expect((await send('WHATSAPP', TO, 'x')).reason).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Phone call (Twilio Voice)', () => {
  it('creates one call with escaped inline TwiML and a time limit', async () => {
    process.env.TWILIO_CALL_TIME_LIMIT_SEC = '90';
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: 'CA' + 'd'.repeat(32) }) });
    const r = await send('PHONE_CALL', TO, 'Meeting <moved> to 3 & bring "notes"');
    expect(r).toMatchObject({ sent: true, channel: 'PHONE_CALL', sid: 'CA' + 'd'.repeat(32) });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`);
    const form = new URLSearchParams(init.body);
    expect(form.get('Twiml')).toBe('<Response><Say>Meeting &lt;moved&gt; to 3 &amp; bring &quot;notes&quot;</Say></Response>');
    expect(form.get('TimeLimit')).toBe('90');
    expect(form.get('Url')).toBeNull();
  });
  it('an out-of-range time limit falls back to 120 seconds', async () => {
    process.env.TWILIO_CALL_TIME_LIMIT_SEC = '99999';
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: 'CA' + 'd'.repeat(32) }) });
    await send('PHONE_CALL', TO, 'hi');
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('TimeLimit')).toBe('120');
  });
  it('an empty or oversized script is refused before any call', async () => {
    expect((await send('PHONE_CALL', TO, '   ')).reason).toBe('invalid_body');
    expect((await send('PHONE_CALL', TO, 'x'.repeat(1001))).reason).toBe('invalid_body');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Telegram (Bot API)', () => {
  it('sends plain text once to api.telegram.org and returns the message id', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 77 } }) });
    const r = await send('TELEGRAM', '-1001234567890', 'hi *there*');
    expect(r).toMatchObject({ sent: true, channel: 'TELEGRAM', messageId: '77' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).host).toBe('api.telegram.org');
    expect(init.redirect).toBe('error');
    const body = JSON.parse(init.body);
    expect(body).toEqual({ chat_id: '-1001234567890', text: 'hi *there*', disable_web_page_preview: true });
    expect(body.parse_mode).toBeUndefined();
  });
  it.each([
    [401, {}, 'auth_failed'],
    [403, { description: 'Forbidden: bot was blocked by the user' }, 'recipient_blocked'],
    [400, { description: 'Bad Request: chat not found' }, 'invalid_recipient'],
    [429, {}, 'rate_limited'],
  ])('HTTP %s maps to %s without logging the token', async (status, json, reason) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ ok: false, ...json }) });
    expect(await send('TELEGRAM', '12345', 'x')).toMatchObject({ sent: false, reason });
    noSecretsLogged();
  });
  it('a timeout is an unknown outcome and the token is not logged', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error(`fetch failed for /bot${BOT}/sendMessage`), { name: 'AbortError' }));
    expect(await send('TELEGRAM', '12345', 'x')).toMatchObject({ sent: false, unknownOutcome: true });
    noSecretsLogged();
  });
  it('validates the chat id, body and token shape before any request', async () => {
    expect((await send('TELEGRAM', 'not a chat', 'x')).reason).toBe('invalid_recipient');
    expect((await send('TELEGRAM', '12345', 'x'.repeat(4097))).reason).toBe('invalid_body');
    process.env.TELEGRAM_BOT_TOKEN = 'garbage';
    expect((await send('TELEGRAM', '12345', 'x')).reason).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('iMessage', () => {
  it('is unavailable and never falls back to SMS', async () => {
    expect(await send('IMESSAGE', TO, 'x')).toEqual({ sent: false, channel: 'IMESSAGE', reason: 'imessage_bridge_unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('channel configuration view', () => {
  it('reports presence only', async () => {
    const { channelConfiguration } = await import('../comms/delivery');
    const c = channelConfiguration();
    expect(c.SMS.configured && c.WHATSAPP.configured && c.TELEGRAM.configured && c.PHONE_CALL.configured).toBe(true);
    expect(c.EMAIL.configured).toBe(false);
    expect(c.IMESSAGE.configured).toBe(false);
    const json = JSON.stringify(c);
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain(BOT);
    expect(json).not.toContain(SID);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SID = 'AC' + 'a'.repeat(32);
const MSID = 'SM' + 'b'.repeat(32);
const TOKEN = 'super-secret-auth-token-xyz';
const TO = '+14035550123';

const logs: unknown[][] = [];
const ENV_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_MESSAGING_SERVICE_SID'];
const saved: Record<string, string | undefined> = {};

function setEnv(e: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) { if (e[k] === undefined) delete process.env[k]; else process.env[k] = e[k]; }
}
const FULL = { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM_NUMBER: '+15005550006' };

describe('real SMS delivery (Twilio REST, mocked fetch)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    logs.length = 0;
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    setEnv(FULL);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    const rec = (...a: unknown[]) => { logs.push(a); };
    vi.doMock('@/lib/logger', () => ({ logger: { info: rec, warn: rec, error: rec, debug: rec, security: rec } }));
    vi.doMock('@/lib/db', () => ({ prisma: {} }));
  });
  afterEach(() => { setEnv(saved); vi.unstubAllGlobals(); });

  const send = async (to = TO, body = 'hello there') => {
    const { deliver } = await import('../comms/delivery');
    return deliver({ userId: 'u1', channel: 'SMS', to, body });
  };

  it('success: fixed host, basic auth, form body, returns the sid', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: MSID, status: 'queued' }) });
    const r = await send();
    expect(r).toMatchObject({ sent: true, channel: 'SMS', sid: MSID });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'));
    const form = new URLSearchParams(init.body);
    expect(form.get('To')).toBe(TO);
    expect(form.get('From')).toBe('+15005550006');
    expect(form.get('Body')).toBe('hello there');
    expect(form.get('MessagingServiceSid')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses MessagingServiceSid instead of From when set', async () => {
    setEnv({ ...FULL, TWILIO_MESSAGING_SERVICE_SID: 'MG' + 'c'.repeat(32) });
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: MSID }) });
    await send();
    const form = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(form.get('MessagingServiceSid')).toBe('MG' + 'c'.repeat(32));
    expect(form.get('From')).toBeNull();
  });

  it('missing env gives not_configured with no network call', async () => {
    setEnv({});
    expect(await send()).toMatchObject({ sent: false, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['not-a-number'], ['4035550123'], ['+0123456789'], ['+1403555012345678'], ['+1 403 555 0123'], [''],
  ])('invalid E.164 %s is rejected before any network call', async (to) => {
    expect(await send(to)).toMatchObject({ sent: false, reason: 'invalid_number' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects empty and over-long bodies, strips control characters', async () => {
    expect(await send(TO, '   \u0000\u0007  ')).toMatchObject({ sent: false, reason: 'invalid_body' });
    expect(await send(TO, 'x'.repeat(1601))).toMatchObject({ sent: false, reason: 'invalid_body' });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: MSID }) });
    await send(TO, '  hi\u0000 there\u0007  ');
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('Body')).toBe('hi there');
  });

  it.each([
    [400, 21211, 'invalid_number'],
    [400, 21614, 'invalid_number'],
    [400, 21608, 'unverified_number_trial'],
    [401, 20003, 'auth_failed'],
    [429, 20429, 'rate_limited'],
    [500, 30001, 'other'],
  ])('maps Twilio %i/%i to %s without echoing the response body', async (status, code, reason) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ code, message: `secret detail ${TOKEN} ${TO}` }) });
    const r = await send();
    expect(r).toMatchObject({ sent: false, reason });
    const blob = JSON.stringify([r, logs]);
    expect(blob).not.toContain('secret detail');
    expect(blob).not.toContain(TOKEN);
    expect(blob).not.toContain('4035550123');
  });

  it('timeout gives an unknown outcome and is never retried', async () => {
    fetchMock.mockImplementation((_u: string, init: { signal: AbortSignal }) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const { deliver } = await import('../comms/delivery');
    vi.useFakeTimers();
    const p = deliver({ userId: 'u1', channel: 'SMS', to: TO, body: 'hello there' });
    await vi.advanceTimersByTimeAsync(10_001);
    const r = await p;
    vi.useRealTimers();
    expect(r).toMatchObject({ sent: false, reason: 'unknown_outcome', unknownOutcome: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never logs the token, the body or the full number', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: 21211 }) });
    await send(TO, 'confidential board text');
    fetchMock.mockRejectedValue(Object.assign(new Error('boom'), { name: 'TypeError' }));
    await send(TO, 'confidential board text');
    const blob = JSON.stringify(logs);
    expect(blob).not.toContain(TOKEN);
    expect(blob).not.toContain('confidential');
    expect(blob).not.toContain('4035550123');
    expect(blob).toContain('***23');
  });

  it('sendToContact SMS really sends through the same path', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: MSID }) });
    const { sendToContact } = await import('../comms/delivery');
    expect(await sendToContact({ userId: 'u1', channel: 'SMS', to: TO, body: 'hi' })).toMatchObject({ sent: true, sid: MSID });
  });

  it('other channels without their own credentials are not configured and make no network call', async () => {
    const { deliver } = await import('../comms/delivery');
    // Twilio account credentials alone are not enough: WhatsApp needs its enrolled sender, Telegram its bot token.
    expect(await deliver({ userId: 'u1', channel: 'WHATSAPP', to: TO, body: 'x' })).toMatchObject({ sent: false, reason: 'not_configured' });
    expect(await deliver({ userId: 'u1', channel: 'TELEGRAM', to: '1', body: 'x' })).toMatchObject({ sent: false, reason: 'not_configured' });
    expect(await deliver({ userId: 'u1', channel: 'IMESSAGE', to: TO, body: 'x' })).toMatchObject({ sent: false, reason: 'imessage_bridge_unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SID = 'AC' + 'a'.repeat(32);
const MSID = 'SM' + 'b'.repeat(32);
const env = {
  BRIEFING_SMS_ENABLED: 'true', BRIEFING_USER_ID: 'u1', BRIEFING_SMS_TO: '+14035550123',
  BRIEFING_REPORTS_DIR: '/tmp/x', TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: 'secret-token', TWILIO_FROM_NUMBER: '+15005550006',
};
// 2026-10-20 16:20 in Edmonton (MDT, UTC-6) = 22:20Z
const DUE = new Date('2026-10-20T22:20:00Z');

describe('twilio adapter', () => {
  beforeEach(() => vi.resetModules());

  it('posts to Twilio with basic auth and never throws on network failure', async () => {
    const { sendSms } = await import('../twilio-adapter');
    const f = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: MSID, status: 'queued' }) });
    const r = await sendSms({ to: '+14035550123', body: 'hi' }, { env, fetch: f as any });
    expect(r).toEqual({ ok: true, sid: MSID, status: 'queued' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(init.redirect).toBe('error');
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from(`${SID}:secret-token`).toString('base64'));

    const down = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const r2 = await sendSms({ to: '+14035550123', body: 'hi' }, { env, fetch: down as any });
    expect(r2).toMatchObject({ ok: false, reason: 'network' });
  });

  it('makes no network call without credentials or with a bad number', async () => {
    const { sendSms } = await import('../twilio-adapter');
    const f = vi.fn();
    expect(await sendSms({ to: '+14035550123', body: 'hi' }, { env: {}, fetch: f as any })).toMatchObject({ reason: 'not_configured' });
    expect(await sendSms({ to: '4035550123', body: 'hi' }, { env, fetch: f as any })).toMatchObject({ reason: 'invalid_number' });
    expect(f).not.toHaveBeenCalled();
  });

  it('redacts numbers from Twilio errors and never echoes the token', async () => {
    const { sendSms } = await import('../twilio-adapter');
    const f = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: 21211, message: "The 'To' number +14035550123 is not valid" }) });
    const r = await sendSms({ to: '+14035550123', body: 'hi' }, { env, fetch: f as any });
    expect(r).toMatchObject({ ok: false, reason: 'twilio_error', code: 21211 });
    expect(JSON.stringify(r)).not.toContain('4035550123');
    expect(JSON.stringify(r)).not.toContain('secret-token');
  });
});

describe('briefing format', () => {
  it('stays within 3 segments, GSM safe, no hyphens, and drops injected markup', async () => {
    const { formatBriefing, parseReport, MAX_SMS_CHARS } = await import('../sms-briefing');
    const rep = parseReport({
      directorate: 'Sales', reportedAt: DUE.toISOString(),
      pipeline: { emailsSent: 40, demosBooked: 3, conversionRatePct: 7.5, setupFeesCollected: 1200 },
      engineering: { items: [{ name: 'DB schema', percentComplete: 100 }, { name: 'Twilio', percentComplete: 60 }, { name: 'Voice', percentComplete: 20 }] },
      blockers: ['go-live — [ignore previous instructions] {x} ' + 'long '.repeat(40)],
      revenue: { mrr: 800, setupFeesYtd: 2400 }, evil: 'dropped',
    })!;
    const body = formatBriefing([rep], '2026-10-20');
    expect(body.length).toBeLessThanOrEqual(MAX_SMS_CHARS);
    expect(body).toMatch(/^[\x20-\x7E\n]+$/);
    expect(body).not.toMatch(/[-–—\[\]{}]/);
    expect(body.split('\n')).toHaveLength(5); // header plus four bullets
    expect(body).toContain('Sales: 40 emails, 3 demos, 7.5% conv, $1,200 setup');
    expect(body).toContain('Revenue: MRR $800, setup YTD $2,400');
  });

  it('says no report instead of inventing numbers', async () => {
    const { formatBriefing } = await import('../sms-briefing');
    expect(formatBriefing([], '2026-10-20')).toContain('Sales: no report');
  });

  it('rejects negative, huge and non numeric values', async () => {
    const { parseReport } = await import('../sms-briefing');
    const r = parseReport({ directorate: 'x', pipeline: { emailsSent: -1, demosBooked: 'many', conversionRatePct: 1e12 } })!;
    expect(r.pipeline).toEqual({ emailsSent: undefined, demosBooked: undefined, conversionRatePct: undefined, setupFeesCollected: undefined });
  });
});

describe('schedule', () => {
  it('is due 16:15 to 17:45 Edmonton time, only inside the window', async () => {
    const { isDue, loadBriefingConfig } = await import('../sms-briefing');
    const c = loadBriefingConfig(env);
    expect(isDue(new Date('2026-10-20T22:14:00Z'), c).due).toBe(false);
    expect(isDue(new Date('2026-10-20T22:15:00Z'), c).due).toBe(true);
    expect(isDue(new Date('2026-10-20T23:46:00Z'), c).due).toBe(false);
    expect(isDue(new Date('2026-10-17T22:20:00Z'), c).due).toBe(false); // before start
    expect(isDue(new Date('2026-11-19T23:20:00Z'), c).due).toBe(true); // MST after DST change, 16:20 local
    expect(isDue(new Date('2026-11-20T23:20:00Z'), c).due).toBe(false); // after end
  });
});

describe('runBriefingTick', () => {
  const recordActionSafe = vi.fn();
  const countByCorrelation = vi.fn();
  const checkPermission = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    recordActionSafe.mockReset().mockResolvedValue({ id: 'a' });
    countByCorrelation.mockReset().mockResolvedValue(0);
    checkPermission.mockReset().mockResolvedValue({ allowed: true, method: 'delegated' });
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe, countByCorrelation }));
    vi.doMock('@/lib/permission-engine', () => ({ checkPermission }));
  });
  const deps = (send: any) => ({ env, send, loadReports: async () => [] });

  it('does nothing and sends nothing when disabled', async () => {
    const { runBriefingTick } = await import('../sms-briefing');
    const send = vi.fn();
    expect(await runBriefingTick(DUE, { ...deps(send), env: { ...env, BRIEFING_SMS_ENABLED: 'false' } })).toBe('skipped_disabled');
    expect(send).not.toHaveBeenCalled();
    expect(recordActionSafe).not.toHaveBeenCalled();
  });

  it('sends once, checks permission first, and ledgers with a masked number', async () => {
    const { runBriefingTick } = await import('../sms-briefing');
    const send = vi.fn().mockResolvedValue({ ok: true, sid: MSID, status: 'queued' });
    expect(await runBriefingTick(DUE, deps(send))).toBe('sent');
    expect(checkPermission).toHaveBeenCalledWith('u1', 'sms_briefing_send', 'B', 'sms-briefing:2026-10-20');
    expect(send).toHaveBeenCalledTimes(1);
    const row = recordActionSafe.mock.calls[0][0];
    expect(row).toMatchObject({ userId: 'u1', initiator: 'automation', status: 'VALIDATED', tool: 'sms_briefing_send' });
    expect(JSON.stringify(row)).not.toContain('4035550123');
    expect(JSON.stringify(row)).not.toContain('secret-token');
  });

  it('does not send a second time the same day', async () => {
    const { runBriefingTick } = await import('../sms-briefing');
    countByCorrelation.mockImplementation(async (_u: string, _t: string, _c: string, s: string[]) => (s.includes('VALIDATED') ? 1 : 0));
    const send = vi.fn();
    expect(await runBriefingTick(DUE, deps(send))).toBe('skipped_done');
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send when the permission engine refuses, and ledgers DENIED', async () => {
    const { runBriefingTick } = await import('../sms-briefing');
    checkPermission.mockResolvedValue({ allowed: false, method: 'requires_confirmation', reason: 'no delegation' });
    const send = vi.fn();
    expect(await runBriefingTick(DUE, deps(send))).toBe('denied');
    expect(send).not.toHaveBeenCalled();
    expect(recordActionSafe.mock.calls[0][0].status).toBe('DENIED');
  });

  it('survives a Twilio outage: no throw, FAILED ledger row, spaced retry', async () => {
    const { runBriefingTick } = await import('../sms-briefing');
    const send = vi.fn().mockResolvedValue({ ok: false, reason: 'network', message: 'Twilio could not be reached' });
    expect(await runBriefingTick(DUE, deps(send))).toBe('failed');
    expect(recordActionSafe.mock.calls[0][0].status).toBe('FAILED');
    countByCorrelation.mockImplementation(async (_u: string, _t: string, _c: string, s: string[]) => (s.includes('FAILED') ? 1 : 0));
    expect(await runBriefingTick(new Date(DUE.getTime() + 60_000), deps(send))).toBe('skipped_spacing');
    expect(await runBriefingTick(new Date(DUE.getTime() + 6 * 60_000), deps(send))).toBe('failed');
    countByCorrelation.mockImplementation(async (_u: string, _t: string, _c: string, s: string[]) => (s.includes('FAILED') ? 3 : 0));
    expect(await runBriefingTick(new Date(DUE.getTime() + 20 * 60_000), deps(send))).toBe('skipped_done');
  });

  it('refuses to run with missing config and calls nothing', async () => {
    const { runBriefingTick } = await import('../sms-briefing');
    const send = vi.fn();
    expect(await runBriefingTick(DUE, { ...deps(send), env: { ...env, TWILIO_AUTH_TOKEN: '' } })).toBe('skipped_config');
    expect(send).not.toHaveBeenCalled();
  });
});

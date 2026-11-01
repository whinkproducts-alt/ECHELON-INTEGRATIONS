import { describe, it, expect, vi, beforeEach } from 'vitest';
import { issueSession, sign, _resetNoncesForTest } from '@/lib/gesture/hmac';
import { holdFrames, POSES } from './fixtures/hand-poses';

process.env.GESTURE_HMAC_SECRET = 'cd'.repeat(32);

const auth = vi.fn();
const dispatchGesture = vi.fn();
const secEvent = vi.fn();
const limiterTake = vi.fn();

let counter = 0;
const nonce = () => `nonce-${String(++counter).padStart(12, '0')}`;

describe('POST /api/gesture', () => {
  beforeEach(() => {
    vi.resetModules();
    _resetNoncesForTest();
    auth.mockReset().mockResolvedValue({ user: { id: 'u1' } });
    dispatchGesture.mockReset().mockResolvedValue({ status: 'executed', intent: 'pause', permissionClass: 'A' });
    secEvent.mockReset().mockResolvedValue(undefined);
    limiterTake.mockReset().mockReturnValue({ allowed: true, remaining: 99, retryAfterMs: 0 });
    vi.doMock('next/server', () => ({
      NextRequest: class {},
      NextResponse: { json: (b: unknown, init?: { status?: number; headers?: Record<string, string> }) => new Response(JSON.stringify(b), { status: init?.status ?? 200, headers: init?.headers }) },
    }));
    vi.doMock('@/auth', () => ({ auth }));
    vi.doMock('@/lib/gesture/dispatch', () => ({ dispatchGesture }));
    vi.doMock('@/lib/gesture/security-events', () => ({ gestureSecurityEvent: secEvent }));
    vi.doMock('@/lib/gesture/rate-limit', () => ({ gestureLimiter: { take: limiterTake } }));
  });

  const build = (over: { userId?: string; body?: object; tamper?: boolean; sig?: string | null; session?: string } = {}) => {
    const s = issueSession(over.userId ?? 'u1');
    const body = JSON.stringify({
      sessionId: s.sessionId, nonce: nonce(), timestamp: Date.now(), handedness: 'Right',
      frames: holdFrames(POSES.palm, 6), ...over.body,
    });
    const sig = over.sig !== undefined ? over.sig : sign(Buffer.from(s.key, 'hex'), body);
    const sent = over.tamper ? body.replace('"Right"', '"Left"') : body;
    return {
      body: sent,
      req: {
        headers: new Headers({
          ...(sig ? { 'x-gesture-signature': sig } : {}),
          'x-gesture-session': over.session ?? s.sessionId,
        }),
        text: async () => sent,
      } as never,
    };
  };
  const post = async (r: { req: never }) => (await import('../../app/api/gesture/route')).POST(r.req);

  it('401 without a session, nothing else runs', async () => {
    auth.mockResolvedValue(null);
    expect((await post(build())).status).toBe(401);
    expect(limiterTake).not.toHaveBeenCalled();
  });

  it('recognises a signed gesture, dispatches it, and reports timings', async () => {
    const res = await post(build());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ recognized: true, gesture: 'palm' });
    expect(j.confidence.total).toBeGreaterThan(200);
    expect(j.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(res.headers.get('Server-Timing')).toContain('total;dur=');
    expect(dispatchGesture).toHaveBeenCalledTimes(1);
    expect(dispatchGesture.mock.calls[0][0]).toBe('u1');
  });

  it('rejects a missing signature, a tampered body and a stranger key, and never dispatches', async () => {
    expect((await post(build({ sig: null }))).status).toBe(401);
    expect((await post(build({ tamper: true }))).status).toBe(401);
    const other = issueSession('u2'); // right format, valid session for another user
    const forged = build({ sig: sign(Buffer.from(other.key, 'hex'), 'whatever') });
    expect((await post(forged)).status).toBe(401);
    expect(dispatchGesture).not.toHaveBeenCalled();
    expect(secEvent).toHaveBeenCalled();
  });

  it('a signature minted for another user does not work for this user', async () => {
    const s = issueSession('u2');
    const body = JSON.stringify({ sessionId: s.sessionId, nonce: nonce(), timestamp: Date.now(), handedness: 'Right', frames: holdFrames(POSES.palm, 3) });
    const req = { headers: new Headers({ 'x-gesture-signature': sign(Buffer.from(s.key, 'hex'), body), 'x-gesture-session': s.sessionId }), text: async () => body } as never;
    expect((await post({ req })).status).toBe(401);
  });

  it('409 on a replayed nonce', async () => {
    const r = build();
    expect((await post(r)).status).toBe(200);
    expect((await post(r)).status).toBe(409);
    expect(dispatchGesture).toHaveBeenCalledTimes(1);
  });

  it('429 with Retry-After when rate limited, before any parsing or dispatch', async () => {
    limiterTake.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 4200 });
    const res = await post(build());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(dispatchGesture).not.toHaveBeenCalled();
  });

  it('400 on a signed but invalid body, 413 on oversize', async () => {
    expect((await post(build({ body: { frames: [] } }))).status).toBe(400);
    const big = build();
    (big.req as any).headers.set('content-length', '999999');
    expect((await post(big)).status).toBe(413);
  });

  it('503 when the server secret is missing', async () => {
    const saved = process.env.GESTURE_HMAC_SECRET;
    const r = build();
    delete process.env.GESTURE_HMAC_SECRET;
    expect((await post(r)).status).toBe(503);
    process.env.GESTURE_HMAC_SECRET = saved;
  });

  it('a hand that matches no gesture returns recognized:false and dispatches nothing', async () => {
    const res = await post(build({ body: { frames: holdFrames(POSES.fist, 6) } }));
    expect((await res.json()).recognized).toBe(false);
    expect(dispatchGesture).not.toHaveBeenCalled();
  });

  it('ignores a gesture name sent by the client', async () => {
    // "claimedGesture" is an unknown field and is rejected outright
    const res = await post(build({ body: { claimedGesture: 'crush' } }));
    expect(res.status).toBe(400);
  });
});

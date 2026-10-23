import { describe, it, expect, beforeEach } from 'vitest';
import { _resetNoncesForTest, claimNonce, deriveKey, issueSession, sign, verify, KEY_TTL_SEC } from '@/lib/gesture/hmac';
import { SlidingWindowLimiter } from '@/lib/gesture/rate-limit';
import { validateGestureRequest } from '@/lib/gesture/validate';
import { holdFrames, POSES } from './fixtures/hand-poses';

process.env.GESTURE_HMAC_SECRET = 'ab'.repeat(32);

describe('HMAC', () => {
  beforeEach(() => _resetNoncesForTest());

  it('accepts a correctly signed body', () => {
    const s = issueSession('u1');
    const body = '{"a":1}';
    expect(verify('u1', s.sessionId, sign(Buffer.from(s.key, 'hex'), body), body)).toEqual({ ok: true });
  });

  it('rejects a tampered body, another user, a wrong key and malformed input', () => {
    const s = issueSession('u1');
    const key = Buffer.from(s.key, 'hex');
    const sig = sign(key, '{"a":1}');
    expect(verify('u1', s.sessionId, sig, '{"a":2}')).toMatchObject({ ok: false, reason: 'bad_signature' });
    expect(verify('u2', s.sessionId, sig, '{"a":1}')).toMatchObject({ ok: false, reason: 'bad_signature' });
    expect(verify('u1', s.sessionId, sign(Buffer.alloc(32, 1), '{"a":1}'), '{"a":1}')).toMatchObject({ ok: false });
    expect(verify('u1', s.sessionId, null, 'x')).toMatchObject({ reason: 'bad_header' });
    expect(verify('u1', s.sessionId, 'v1=zz', 'x')).toMatchObject({ reason: 'bad_header' });
    expect(verify('u1', 'nope', sig, 'x')).toMatchObject({ reason: 'bad_session' });
  });

  it('expires sessions, and a client cannot extend expiry without breaking the key', () => {
    const now = 1_800_000_000_000;
    const s = issueSession('u1', now);
    const key = Buffer.from(s.key, 'hex');
    const sig = sign(key, 'b');
    expect(verify('u1', s.sessionId, sig, 'b', now + (KEY_TTL_SEC - 1) * 1000).ok).toBe(true);
    expect(verify('u1', s.sessionId, sig, 'b', now + (KEY_TTL_SEC + 1) * 1000)).toMatchObject({ reason: 'session_expired' });
    const [, rand] = s.sessionId.split('.');
    const extended = `${Math.floor(now / 1000) + 999999}.${rand}`;
    expect(verify('u1', extended, sig, 'b', now)).toMatchObject({ reason: 'bad_signature' });
  });

  it('fails closed when the secret is missing or malformed', () => {
    const saved = process.env.GESTURE_HMAC_SECRET;
    process.env.GESTURE_HMAC_SECRET = 'short';
    expect(() => deriveKey('u', '1.a')).toThrow('gesture_hmac_not_configured');
    process.env.GESTURE_HMAC_SECRET = saved;
  });

  it('claims each nonce once per user', () => {
    expect(claimNonce('u1', 'n'.repeat(16), 1000)).toBe(true);
    expect(claimNonce('u1', 'n'.repeat(16), 1500)).toBe(false);
    expect(claimNonce('u2', 'n'.repeat(16), 1500)).toBe(true);
    expect(claimNonce('u1', 'n'.repeat(16), 1000 + 10_001)).toBe(true);
  });
});

describe('rate limit: 100 per minute per user', () => {
  it('allows 100, blocks the 101st, recovers when the window slides', () => {
    const l = new SlidingWindowLimiter();
    for (let i = 0; i < 100; i++) expect(l.take('u1', 1000 + i).allowed).toBe(true);
    const blocked = l.take('u1', 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(l.take('u1', 1000 + 60_001).allowed).toBe(true);
  });
  it('is per user', () => {
    const l = new SlidingWindowLimiter();
    for (let i = 0; i < 100; i++) l.take('u1', 1000);
    expect(l.take('u1', 1001).allowed).toBe(false);
    expect(l.take('u2', 1001).allowed).toBe(true);
  });
  it('blocked attempts do not extend the block', () => {
    const l = new SlidingWindowLimiter();
    for (let i = 0; i < 100; i++) l.take('u1', 0);
    for (let i = 0; i < 500; i++) l.take('u1', 30_000);
    expect(l.take('u1', 60_001).allowed).toBe(true);
  });
});

describe('request validation', () => {
  const now = 1_800_000_000_000;
  const good = () => ({
    sessionId: '1.a', nonce: 'x'.repeat(16), timestamp: now, handedness: 'Right',
    frames: holdFrames(POSES.palm, 3),
  });
  it('accepts a good request', () => {
    expect(validateGestureRequest(good(), now).ok).toBe(true);
  });
  it.each([
    ['unknown key', (b: any) => { b.extra = 1; }],
    ['stale timestamp', (b: any) => { b.timestamp = now - 2500; }],
    ['future timestamp', (b: any) => { b.timestamp = now + 2500; }],
    ['short nonce', (b: any) => { b.nonce = 'abc'; }],
    ['bad handedness', (b: any) => { b.handedness = 'Both'; }],
    ['no frames', (b: any) => { b.frames = []; }],
    ['too many frames', (b: any) => { b.frames = holdFrames(POSES.palm, 31); }],
    ['20 landmarks', (b: any) => { b.frames[0].landmarks.pop(); }],
    ['NaN landmark', (b: any) => { b.frames[0].landmarks[3] = [NaN, 0, 0]; }],
    ['string landmark', (b: any) => { b.frames[0].landmarks[3] = ['0', 0, 0]; }],
    ['out of range', (b: any) => { b.frames[0].landmarks[3] = [9, 0, 0]; }],
    ['time not increasing', (b: any) => { b.frames[1].t = b.frames[0].t; }],
    ['window too long', (b: any) => { b.frames[2].t = 5000; }],
    ['target extra field', (b: any) => { b.target = { role: 'admin' }; }],
    ['target bad id', (b: any) => { b.target = { taskId: '../../x y' }; }],
  ])('rejects %s', (_n, mutate) => {
    const b: any = good();
    mutate(b);
    expect(validateGestureRequest(b, now).ok).toBe(false);
  });
});

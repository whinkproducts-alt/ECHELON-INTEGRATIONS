export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { generateCorrelationId } from '@/lib/logger';
import { claimNonce, isGestureHmacConfigured, verify } from '@/lib/gesture/hmac';
import { gestureLimiter } from '@/lib/gesture/rate-limit';
import { recognize } from '@/lib/gesture/recognize';
import { dispatchGesture } from '@/lib/gesture/dispatch';
import { gestureSecurityEvent } from '@/lib/gesture/security-events';
import { MAX_BODY_BYTES, validateGestureRequest } from '@/lib/gesture/validate';

/**
 * POST /api/gesture
 * Headers: x-gesture-session, x-gesture-signature (v1=<hmac-sha256 hex of the raw body>)
 * Body: see GestureRequest. 21 point MediaPipe landmarks, 1 to 30 frames.
 */
export async function POST(req: NextRequest) {
  const t0 = performance.now();
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isGestureHmacConfigured()) return NextResponse.json({ error: 'gesture_disabled' }, { status: 503 });
  const correlationId = generateCorrelationId();

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });

  const limit = gestureLimiter.take(userId);
  if (!limit.allowed) {
    await gestureSecurityEvent(userId, 'rate_limited', 'over 100 gestures per minute', correlationId);
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });

  const sessionHeader = req.headers.get('x-gesture-session');
  const v = verify(userId, sessionHeader, req.headers.get('x-gesture-signature'), raw);
  if (!v.ok) {
    await gestureSecurityEvent(userId, 'bad_signature', `signature rejected: ${v.reason}`, correlationId);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const tVerified = performance.now();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const valid = validateGestureRequest(parsed);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
  if (valid.value.sessionId !== sessionHeader) {
    await gestureSecurityEvent(userId, 'session_mismatch', 'body session differs from signed header', correlationId);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  if (!claimNonce(userId, valid.value.nonce)) {
    await gestureSecurityEvent(userId, 'replay', 'nonce reused', correlationId);
    return NextResponse.json({ error: 'Replay detected' }, { status: 409 });
  }

  const rec = recognize(valid.value.frames);
  const tRecognized = performance.now();
  if (!rec) {
    const total = performance.now() - t0;
    return NextResponse.json(
      { recognized: false, timings: { verifyMs: round(tVerified - t0), recognizeMs: round(tRecognized - tVerified), totalMs: round(total) } },
      { headers: { 'Server-Timing': `total;dur=${round(total)}` } },
    );
  }

  const result = await dispatchGesture(userId, rec, valid.value, correlationId);
  const tDone = performance.now();
  return NextResponse.json(
    {
      recognized: true,
      gesture: rec.gesture,
      confidence: rec.confidence,
      detail: rec.detail,
      result,
      correlationId,
      timings: {
        verifyMs: round(tVerified - t0),
        recognizeMs: round(tRecognized - tVerified),
        dispatchMs: round(tDone - tRecognized),
        totalMs: round(tDone - t0),
      },
    },
    {
      headers: {
        'Server-Timing': `verify;dur=${round(tVerified - t0)}, recognize;dur=${round(tRecognized - tVerified)}, dispatch;dur=${round(tDone - tRecognized)}, total;dur=${round(tDone - t0)}`,
        'Cache-Control': 'no-store',
      },
    },
  );
}

const round = (n: number): number => Math.round(n * 100) / 100;

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isGestureHmacConfigured, issueSession } from '@/lib/gesture/hmac';
import { SlidingWindowLimiter } from '@/lib/gesture/rate-limit';

const keyLimiter = new SlidingWindowLimiter(10, 60_000);

/** GET /api/gesture/key: issues a one hour signing session for the signed in user. */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isGestureHmacConfigured()) return NextResponse.json({ error: 'gesture_disabled' }, { status: 503 });
  if (!keyLimiter.take(userId).allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  return NextResponse.json(issueSession(userId), { headers: { 'Cache-Control': 'no-store' } });
}

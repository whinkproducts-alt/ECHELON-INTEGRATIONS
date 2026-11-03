export const dynamic = 'force-dynamic';
// R08 daily Board Room briefing. GET returns today's latest revision (generated on the first request of the
// local day). POST { action: 'seen', id } records that it was played or skipped; POST { action: 'regenerate' }
// makes a new revision from current records (Replay with fresh data).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { getTodaysBriefing, markBriefingSeen, regenerateBriefing } from '@/lib/briefing/daily';
import { limitOr429 } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('seen'), id: z.string().min(1).max(64) }),
  z.object({ action: z.literal('regenerate') }),
]);

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  try {
    return NextResponse.json({ briefing: await getTodaysBriefing(a.userId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('daily briefing failed', { error: (e as Error)?.message });
    return NextResponse.json({ error: 'The briefing could not be prepared. Try again.' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const b = await readJsonBody(req, 2 * 1024);
  if ('response' in b) return b.response;
  const parsed = Body.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (parsed.data.action === 'seen') {
    await markBriefingSeen(a.userId, parsed.data.id);
    return NextResponse.json({ ok: true });
  }
  const limited = await limitOr429('briefing', a.userId);
  if (limited) return limited;
  try {
    return NextResponse.json({ briefing: await regenerateBriefing(a.userId) });
  } catch (e) {
    logger.error('daily briefing regenerate failed', { error: (e as Error)?.message });
    return NextResponse.json({ error: 'The briefing could not be prepared. Try again.' }, { status: 503 });
  }
}

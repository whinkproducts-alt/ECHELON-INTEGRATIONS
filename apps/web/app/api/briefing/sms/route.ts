export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { requestSmsBriefing } from '@/lib/briefing/sms';
import { logger } from '@/lib/logger';

/**
 * Creates an approval request for sending the user's briefing to their own SMS number.
 * Nothing is sent here. The owner approves the returned request by id (30 s, hash locked, once).
 * The request takes no body: the text and destination are built on the server.
 */
export async function POST() {
  const who = await requireUserId();
  if ('response' in who) return who.response;
  const limited = await limitOr429('comms', who.userId);
  if (limited) return limited;

  try {
    const r = await requestSmsBriefing(who.userId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ approvalId: r.approvalId, approval: r.approval, preview: r.preview });
  } catch (e) {
    logger.error('sms briefing request failed', { error: (e as Error)?.message });
    return NextResponse.json({ error: 'Could not prepare the briefing' }, { status: 500 });
  }
}

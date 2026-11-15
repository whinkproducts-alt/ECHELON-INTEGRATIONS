export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { requireOwner } from '@/lib/capability/api';
import { eventsAfter, latestCursor } from '@/lib/capability/events';
import { ledgerSse } from '@/lib/events/sse';

export async function GET(req: Request) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  return ledgerSse(req, (cursor, limit) => eventsAfter(who.userId, cursor, limit), () => latestCursor(who.userId));
}

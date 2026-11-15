export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { ledgerSse } from '@/lib/events/sse';
import { marcusEventsAfter, marcusLatestCursor } from '@/lib/marcus/feed';
import { resolveMarcusOwner } from '@/lib/marcus/freeze';

/** SSE feed Marcus subscribes to: one {task_id, status} event per Marcus task change. Resume with Last-Event-ID. */
export async function GET(req: Request) {
  const auth = requireMarcusAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const owner = await resolveMarcusOwner();
  if (!owner) return NextResponse.json({ error: 'Owner account is not configured (WHINK_OWNER_EMAILS)' }, { status: 503 });
  return ledgerSse(req, (cursor, limit) => marcusEventsAfter(owner.id, cursor, limit), () => marcusLatestCursor(owner.id));
}

import { prisma } from '@/lib/db';
import { encodeCursor, type Cursor } from '@/lib/capability/events';
import type { SseEvent } from '@/lib/events/sse';

const PREFIX = 'capability_marcus_';
const TASK_REF = 'marcus-task:';

/** The status Marcus maps through its own task_status table. Null = not a task status change. */
export function marcusStatusFor(action: string, errorCode: string | null): string | null {
  switch (action) {
    case `${PREFIX}task_received`: return errorCode === 'RECONFIRMATION_REQUIRED' ? 'reconfirmation_required' : 'received';
    case `${PREFIX}task_frozen`: return 'frozen';
    case `${PREFIX}task_unfrozen`:
    case `${PREFIX}task_reconfirmed`:
    case `${PREFIX}task_resumed`: return 'received';
    default: return null;
  }
}

// Query only these so no row is ever skipped (a skipped row would not advance the cursor).
const ACTIONS = ['task_received', 'task_frozen', 'task_unfrozen', 'task_reconfirmed', 'task_resumed'].map((a) => `${PREFIX}${a}`);

const where = (userId: string, cursor: Cursor | null) => ({
  userId,
  action: { in: ACTIONS },
  ...(cursor
    ? { AND: [{ OR: [{ createdAt: { gt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } }] }] }
    : {}),
});

/** Marcus-shaped events after the cursor: data is {task_id, status, at}, the keys Marcus applies. */
export async function marcusEventsAfter(userId: string, cursor: Cursor | null, limit = 200): Promise<SseEvent[]> {
  const rows = await prisma.action.findMany({
    where: where(userId, cursor),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: Math.min(Math.max(limit, 1), 1000),
    select: { id: true, action: true, errorCode: true, createdAt: true, correlationId: true },
  });
  const out: SseEvent[] = [];
  for (const r of rows) {
    const status = marcusStatusFor(r.action, r.errorCode);
    // The ledger's capabilityId is a Tool foreign key, so the task id travels in correlationId.
    const taskId = r.correlationId?.startsWith(TASK_REF) ? r.correlationId.slice(TASK_REF.length) : null;
    if (!status || !taskId) continue;
    out.push({ id: encodeCursor({ createdAt: r.createdAt.getTime(), id: r.id }), type: r.action.slice(PREFIX.length), data: { task_id: taskId, status, at: r.createdAt.toISOString() } });
  }
  return out;
}

export async function marcusLatestCursor(userId: string): Promise<Cursor | null> {
  const r = await prisma.action.findFirst({ where: { userId, action: { in: ACTIONS } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, createdAt: true } });
  return r ? { createdAt: r.createdAt.getTime(), id: r.id } : null;
}

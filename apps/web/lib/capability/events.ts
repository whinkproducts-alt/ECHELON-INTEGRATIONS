/**
 * Event feed for the Integration Hub (E4b-08). The ledger is the durable outbox: an event is a
 * ledger row, so a live event always has a stored row behind it, replay after a reconnect is a
 * query, and the UI can never show something that did not happen. Cursor = createdAt ms + row id.
 * Authentication is the existing session cookie (EventSource sends it), so no ticket table exists.
 */
import { prisma } from '@/lib/db';

export const EVENT_ACTION_PREFIXES = ['capability_', 'provider_', 'host_', 'grant_'] as const;

export interface Cursor { createdAt: number; id: string }

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.createdAt}:${c.id}`).toString('base64url');
}
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 200) return null;
  try {
    const text = Buffer.from(raw, 'base64url').toString('utf8');
    const i = text.indexOf(':');
    if (i < 1) return null;
    const ms = Number(text.slice(0, i));
    const id = text.slice(i + 1);
    return Number.isInteger(ms) && ms > 0 && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? { createdAt: ms, id } : null;
  } catch {
    return null;
  }
}

export interface FeedEvent {
  id: string; // cursor
  type: string;
  data: {
    actionId: string; status: string; errorCode: string | null; at: string;
    capabilityId: string | null; connectorInstallId: string | null; hostId: string | null; approvalId: string | null; grantId: string | null;
  };
}

type Row = { id: string; action: string; status: string; errorCode: string | null; createdAt: Date; capabilityId: string | null; connectorInstallId: string | null; hostId: string | null; approvalId: string | null; grantId: string | null };

export function toFeedEvent(r: Row): FeedEvent {
  return {
    id: encodeCursor({ createdAt: r.createdAt.getTime(), id: r.id }),
    type: r.action,
    data: { actionId: r.id, status: r.status, errorCode: r.errorCode, at: r.createdAt.toISOString(), capabilityId: r.capabilityId, connectorInstallId: r.connectorInstallId, hostId: r.hostId, approvalId: r.approvalId, grantId: r.grantId },
  };
}

const kindFilter = EVENT_ACTION_PREFIXES.map((p) => ({ action: { startsWith: p } }));

/** Events strictly after the cursor, oldest first. Scoped by userId. */
export async function eventsAfter(userId: string, cursor: Cursor | null, limit = 200): Promise<FeedEvent[]> {
  const rows = await prisma.action.findMany({
    where: {
      userId,
      OR: kindFilter,
      ...(cursor
        ? { AND: [{ OR: [{ createdAt: { gt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } }] }] }
        : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: Math.min(Math.max(limit, 1), 1000),
    select: { id: true, action: true, status: true, errorCode: true, createdAt: true, capabilityId: true, connectorInstallId: true, hostId: true, approvalId: true, grantId: true },
  });
  return rows.map(toFeedEvent);
}

/** The newest event's cursor, so a client with no cursor starts "from now". */
export async function latestCursor(userId: string): Promise<Cursor | null> {
  const r = await prisma.action.findFirst({ where: { userId, OR: kindFilter }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, createdAt: true } });
  return r ? { createdAt: r.createdAt.getTime(), id: r.id } : null;
}

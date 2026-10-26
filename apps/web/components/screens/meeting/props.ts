// Server-safe helper: turns the board roster into the plain props the meeting screen needs.
// Names and the host come from lib/board.ts (config/board.json). Nothing is hardcoded here except the
// roster id of the executive assistant who hosts quick meetings.
import type { BoardMember } from '@/lib/board';

export const HOST_ID = 'marcus-vale';

export interface MeetingPerson { id: string; name: string; imageUrl: string | null }
export interface MeetingHost extends MeetingPerson { email: string; seat: string | null }
export interface MeetingScreenProps { host: MeetingHost | null; invitees: MeetingPerson[] }

export function toMeetingProps(members: BoardMember[]): MeetingScreenProps {
  const h = members.find((m) => m.id === HOST_ID);
  const host = h && h.email ? { id: h.id, name: h.name, email: h.email, seat: h.seat, imageUrl: h.imageUrl } : null;
  return {
    host,
    invitees: members.filter((m) => m.id !== HOST_ID).map((m) => ({ id: m.id, name: m.name, imageUrl: m.imageUrl })),
  };
}

/** Only absolute http(s) URLs may become a link. Anything else (javascript:, data:, relative) is refused. */
export function safeMeetingUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

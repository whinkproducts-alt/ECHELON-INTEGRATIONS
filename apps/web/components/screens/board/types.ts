// Shape of GET/POST /api/board/meetings views (see lib/board-meetings.ts toMeetingView).
export interface BoardMeetingView {
  id: string;
  title: string;
  scheduledFor: string;
  agenda: string[];
  attendees: string[];
  status: 'SCHEDULED' | 'HELD' | 'CANCELLED' | string;
  /** Untrusted free text. Render as text only. */
  minutes: string | null;
  minutesAt: string | null;
  createdAt: string;
}

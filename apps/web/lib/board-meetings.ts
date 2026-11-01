/**
 * Board meetings. Every query is scoped by userId. Minutes are free text that may have been
 * pasted from outside, so they are untrusted data: capped, stripped of fake envelope tags on
 * read, and wrapped before they ever enter model context.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { runGuarded } from '@/lib/guarded-action';
import { stripFakeUntrustedTags, wrapUntrustedContent } from '@/lib/content-isolation';

export const MINUTES_MAX = 50_000;

export const MeetingInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  scheduledFor: z.string().datetime({ offset: true }),
  agenda: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  attendees: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  status: z.enum(['SCHEDULED', 'HELD', 'CANCELLED']).default('SCHEDULED'),
}).strict();

export const MinutesInputSchema = z.object({ minutes: z.string().min(1).max(MINUTES_MAX) }).strict();

interface MeetingRow {
  id: string; userId: string; title: string; scheduledFor: Date; agenda: string[]; attendees: string[];
  status: string; minutes: string | null; minutesAt: Date | null; createdAt: Date;
}

export function toMeetingView(r: MeetingRow) {
  return {
    id: r.id,
    title: r.title,
    scheduledFor: r.scheduledFor.toISOString(),
    agenda: r.agenda,
    attendees: r.attendees,
    status: r.status,
    // Untrusted: shown as data only. Never place in a prompt without readMinutesForModel.
    minutes: r.minutes === null ? null : stripFakeUntrustedTags(r.minutes).substring(0, MINUTES_MAX),
    minutesUntrusted: true as const,
    minutesAt: r.minutesAt ? r.minutesAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** The only way minutes may enter model context. */
export function readMinutesForModel(meetingId: string, minutes: string): string {
  return wrapUntrustedContent(stripFakeUntrustedTags(minutes).substring(0, MINUTES_MAX), 'board_minutes', `board-meeting:${meetingId}`);
}

export async function listMeetings(userId: string, take = 50) {
  if (!userId) throw new Error('board: userId is required');
  const rows = await prisma.boardMeeting.findMany({
    where: { userId },
    orderBy: { scheduledFor: 'desc' },
    take: Math.min(Math.max(1, take), 100),
  });
  return rows.map(toMeetingView);
}

export async function createMeeting(userId: string, input: z.infer<typeof MeetingInputSchema>) {
  if (!userId) throw new Error('board: userId is required');
  return runGuarded(
    { userId, capability: 'board_meeting_create', permissionClass: 'A', action: 'board_meeting_created', summary: `agenda=${input.agenda.length} attendees=${input.attendees.length}` },
    async () => {
      const row = await prisma.boardMeeting.create({
        data: {
          userId,
          title: input.title,
          scheduledFor: new Date(input.scheduledFor),
          agenda: input.agenda,
          attendees: input.attendees,
          status: input.status,
        },
      });
      return toMeetingView(row);
    },
  );
}

/** Returns null when the meeting is not this user's (callers answer 404). */
export async function saveMinutes(userId: string, meetingId: string, minutes: string) {
  if (!userId) throw new Error('board: userId is required');
  const owned = await prisma.boardMeeting.findFirst({ where: { id: meetingId, userId }, select: { id: true } });
  if (!owned) return null;
  return runGuarded(
    { userId, capability: 'board_minutes_write', permissionClass: 'A', action: 'board_minutes_saved', summary: `meetingId=${meetingId} chars=${minutes.length}` },
    async () => {
      const res = await prisma.boardMeeting.updateMany({
        where: { id: meetingId, userId },
        data: { minutes, minutesAt: new Date() },
      });
      if (res.count !== 1) throw new Error('meeting vanished');
      const row = await prisma.boardMeeting.findFirst({ where: { id: meetingId, userId } });
      if (!row) throw new Error('meeting vanished');
      return toMeetingView(row);
    },
  );
}

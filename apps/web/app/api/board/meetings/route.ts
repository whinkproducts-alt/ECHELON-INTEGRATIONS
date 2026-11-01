export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { createMeeting, listMeetings, MeetingInputSchema } from '@/lib/board-meetings';

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  return NextResponse.json({ meetings: await listMeetings(a.userId) });
}

export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const b = await readJsonBody(req);
  if ('response' in b) return b.response;
  const parsed = MeetingInputSchema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid meeting', issues: parsed.error.flatten() }, { status: 400 });
  const res = await createMeeting(a.userId, parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ meeting: res.value }, { status: 201 });
}

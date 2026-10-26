import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { z } from 'zod';
import { writeLedger } from '@/lib/ledger';
import { checkPermission } from '@/lib/permission-engine';
import { createRoom } from '@/lib/meetings/provider';

const Schema = z.object({
  assistantName: z.string().max(100),
  assistantEmail: z.string().email(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const correlationId = crypto.randomUUID();

  // Creating a room only mints an unguessable URL on the owner's own provider: Class A.
  const perm = await checkPermission(session.user.id, 'meeting_room_create', 'A', correlationId);
  if (!perm.allowed) {
    await writeLedger({ userId: session.user.id, initiator: 'user', persona: 'WHINK', action: 'meeting_room_denied', tool: 'meeting_room_create', permissionClass: 'A', status: 'DENIED', correlationId, outputSummary: perm.reason ?? 'denied' });
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  }

  // Self-hosted provider only (MEETING_PROVIDER_BASE_URL). With none configured, no call goes out to anyone.
  const room = createRoom();
  const meetingUrl: string | null = room.url;

  // Ledger the meeting request. The room URL is an access secret, so only the provider host is recorded.
  await writeLedger({
    userId: session.user.id,
    initiator: 'user',
    persona: 'WHINK',
    action: 'meeting_quick_start',
    tool: 'meeting_room_create',
    permissionClass: 'A',
    status: 'EXECUTED',
    correlationId,
    metadata: {
      assistantName: parsed.data.assistantName,
      assistantEmail: parsed.data.assistantEmail,
      roomCreated: room.url !== null,
      provider: room.url !== null ? room.provider : null,
      reason: room.url === null ? room.reason : null,
    },
  });

  return NextResponse.json({
    meetingUrl,
    fallback: {
      email: parsed.data.assistantEmail,
      message: meetingUrl
        ? `Room ready. If it does not open, contact ${parsed.data.assistantName} directly at ${parsed.data.assistantEmail}`
        : `Meeting room not configured yet. Contact ${parsed.data.assistantName} directly at ${parsed.data.assistantEmail}`,
    },
  });
}

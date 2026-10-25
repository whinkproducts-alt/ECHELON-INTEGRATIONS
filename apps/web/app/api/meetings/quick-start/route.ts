import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { z } from 'zod';
import { writeLedger } from '@/lib/ledger';

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

  // Ledger the meeting request
  await writeLedger({
    userId: session.user.id,
    initiator: 'user',
    persona: 'WHINK',
    action: 'meeting_quick_start',
    permissionClass: 'A',
    status: 'EXECUTED',
    correlationId: crypto.randomUUID(),
    metadata: {
      assistantName: parsed.data.assistantName,
      assistantEmail: parsed.data.assistantEmail,
    },
  });

  // Meeting room integration placeholder.
  // When a real video conferencing integration is configured (Google Meet, Zoom, Teams),
  // this returns a meetingUrl. Until then, respond with contact info.
  const meetingUrl: string | null = null;

  return NextResponse.json({
    meetingUrl,
    fallback: {
      email: parsed.data.assistantEmail,
      message: `Meeting room not configured yet. Contact ${parsed.data.assistantName} directly at ${parsed.data.assistantEmail}`,
    },
  });
}

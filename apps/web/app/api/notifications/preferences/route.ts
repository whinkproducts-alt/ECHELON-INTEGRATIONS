import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const PreferenceSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'TELEGRAM', 'PHONE_CALL']),
  enabled: z.boolean(),
  address: z.string().optional(),
  schedule: z.enum(['IMMEDIATE', 'DAILY', 'WEEKLY']).default('DAILY'),
  time: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  timeZone: z.string().default('America/Edmonton'),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: session.user.id },
  });
  return NextResponse.json({ preferences: prefs });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PreferenceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const pref = await prisma.notificationPreference.upsert({
    where: { userId_channel: { userId: session.user.id, channel: parsed.data.channel } },
    create: { userId: session.user.id, ...parsed.data },
    update: { ...parsed.data },
  });
  return NextResponse.json({ preference: pref });
}

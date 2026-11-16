export const dynamic = 'force-dynamic';
// Founder-only one-to-one chat with any org entity ({ key, message }). No tools; thread saved per entity.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { isOwnerEmail } from '@/lib/owner';
import { readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { lockdownResponse } from '@/lib/safety/lockdown-http';
import { talkTo } from '@/lib/org/chat';

const Body = z.object({ key: z.string().min(1).max(200), message: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isOwnerEmail(s.user.email)) return NextResponse.json({ error: 'Founder access required' }, { status: 403 });
  const userId = s.user.id;
  const limited = await limitOr429('briefing', userId);
  if (limited) return limited;
  const locked = await lockdownResponse(userId, 'org_chat');
  if (locked) return locked;
  const b = await readJsonBody(req, 8 * 1024);
  if ('response' in b) return b.response;
  const p = Body.safeParse(b.body);
  if (!p.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const r = await talkTo(userId, p.data.key, p.data.message);
  return r.ok ? NextResponse.json({ reply: r.reply }) : NextResponse.json({ error: r.error }, { status: r.status });
}

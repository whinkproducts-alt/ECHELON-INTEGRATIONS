export const dynamic = 'force-dynamic';
// Founder-only chat with one Kill Team member ({ target: slug }) or the whole team ({ target: 'all' }).
// No tools, no memory write, nothing stored. Replies come from the model router.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { isOwnerEmail } from '@/lib/owner';
import { readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { lockdownResponse } from '@/lib/safety/lockdown-http';
import { askMember, listMembers } from '@/lib/kill-team';
import { logger } from '@/lib/logger';

const Body = z.object({ target: z.string().min(1).max(40), message: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isOwnerEmail(s.user.email)) return NextResponse.json({ error: 'Founder access required' }, { status: 403 });
  const userId = s.user.id;
  const limited = await limitOr429('briefing', userId);
  if (limited) return limited;
  const locked = await lockdownResponse(userId, 'kill_team_chat');
  if (locked) return locked;
  const b = await readJsonBody(req, 8 * 1024);
  if ('response' in b) return b.response;
  const parsed = Body.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { target, message } = parsed.data;
  const members = await listMembers(userId);
  const chosen = target === 'all' ? members : members.filter((m) => m.slug === target);
  if (chosen.length === 0) return NextResponse.json({ error: 'No such member' }, { status: 404 });
  const settled = await Promise.allSettled(chosen.map((m) => askMember(m, message, target === 'all')));
  const replies = chosen.map((m, i) => {
    const r = settled[i];
    if (r.status === 'fulfilled' && r.value) return { slug: m.slug, name: m.name, reply: r.value };
    logger.warn('kill team reply failed', { slug: m.slug, error: r.status === 'rejected' ? (r.reason as Error)?.message : 'empty' });
    return { slug: m.slug, name: m.name, error: 'No reply. The model may be unavailable or over budget.' };
  });
  return NextResponse.json({ replies });
}

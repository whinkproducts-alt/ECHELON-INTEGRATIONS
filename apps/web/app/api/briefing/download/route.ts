export const dynamic = 'force-dynamic';
// Briefing as a plain-text file for the signed-in owner's own browser. Nothing leaves the account, so no approval.
import { requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { buildSmsBriefing } from '@/lib/briefing/sms';
import { prisma } from '@/lib/db';

export async function GET() {
  const who = await requireUserId();
  if ('response' in who) return who.response;
  const limited = await limitOr429('briefing', who.userId);
  if (limited) return limited;
  const pref = await prisma.notificationPreference.findFirst({ where: { userId: who.userId }, select: { timeZone: true } });
  const text = await buildSmsBriefing(who.userId, pref?.timeZone || 'America/Edmonton');
  return new Response(text + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="briefing-${new Date().toISOString().slice(0, 10)}.txt"`,
      'Cache-Control': 'no-store',
    },
  });
}

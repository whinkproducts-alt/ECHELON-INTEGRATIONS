export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isOwnerEmail } from '@/lib/owner';
import { deleteMember } from '@/lib/kill-team';
import { recordActionSafe } from '@/lib/ledger';

export async function DELETE(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isOwnerEmail(s.user.email)) return NextResponse.json({ error: 'Founder access required' }, { status: 403 });
  const { slug } = await ctx.params;
  if (!(await deleteMember(s.user.id, slug))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordActionSafe({ userId: s.user.id, initiator: 'user', persona: 'WHINK', tool: 'kill_team_member', action: 'kill_team_member_deleted', permissionClass: 'A', status: 'VALIDATED', inputSummary: `slug ${slug}` });
  return NextResponse.json({ ok: true });
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { limitOr429 } from '@/lib/rate-limit';
import { getApprovalHistoryItem } from '@/lib/ledger-search';

/** One of the caller's own approval requests plus its ledger trail. Another user's id is a 404. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await limitOr429('read', userId);
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!id || id.length > 64) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const found = await getApprovalHistoryItem(userId, id);
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(found);
}

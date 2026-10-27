export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { getRun } from '@/lib/swarm/service';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await ctx.params;
  const r = await getRun(a.userId, id);
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(r);
}

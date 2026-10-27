export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { cancelRun } from '@/lib/swarm/service';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await ctx.params;
  const r = await cancelRun(a.userId, id);
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.code ? { code: r.code } : {}) }, { status: r.status });
  return NextResponse.json(r.value);
}

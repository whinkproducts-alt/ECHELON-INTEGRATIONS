export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { startRun } from '@/lib/swarm/service';

/** The explicit start click. Atomic PLANNED to RUNNING; refuses past the hard budget limit. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('swarm', a.userId);
  if (limited) return limited;
  const { id } = await ctx.params;
  const r = await startRun(a.userId, id);
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.code ? { code: r.code } : {}) }, { status: r.status });
  return NextResponse.json(r.value, { status: 202 });
}

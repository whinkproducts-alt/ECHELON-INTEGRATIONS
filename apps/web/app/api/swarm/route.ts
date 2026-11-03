export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { lockdownResponse } from '@/lib/safety/lockdown-http';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { PlanInputSchema, createPlan, listRuns } from '@/lib/swarm/service';

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  return NextResponse.json({ runs: await listRuns(a.userId) });
}

/** Plan and estimate only. Nothing runs until POST /api/swarm/[id]/start. */
export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('swarm', a.userId);
  if (limited) return limited;
  const locked = await lockdownResponse(a.userId, 'swarm_plan');
  if (locked) return locked;
  const body = await readJsonBody(req, 24 * 1024);
  if ('response' in body) return body.response;
  const parsed = PlanInputSchema.safeParse(body.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const r = await createPlan(a.userId, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.code ? { code: r.code } : {}) }, { status: r.status });
  return NextResponse.json(r.value, { status: 201 });
}

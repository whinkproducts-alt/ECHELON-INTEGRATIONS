export const dynamic = 'force-dynamic';
// R07 lockdown control. Each account controls its own lockdown. Engaging needs nothing more than a session
// (stopping must always be easy). Releasing needs an explicit confirmation and the epoch the screen showed,
// so a stale screen cannot undo a newer engagement.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { getSafetyState, setLockdown } from '@/lib/safety/lockdown';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('engage'), reason: z.string().max(200).optional() }),
  z.object({ action: z.literal('release'), confirm: z.literal('RELEASE'), expectedEpoch: z.number().int().min(0), reason: z.string().max(200).optional() }),
]);

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const state = await getSafetyState(a.userId);
  return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const b = await readJsonBody(req, 4 * 1024);
  if ('response' in b) return b.response;
  const parsed = Body.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lockdown request' }, { status: 400 });
  const d = parsed.data;
  const res = d.action === 'engage'
    ? await setLockdown(a.userId, true, { reason: d.reason })
    : await setLockdown(a.userId, false, { reason: d.reason, expectedEpoch: d.expectedEpoch });
  if (!res.ok) return NextResponse.json({ error: res.error, state: res.state }, { status: res.status });
  return NextResponse.json({ state: res.state, changed: res.changed });
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getEnvelope, parseEnvelope, requestEnvelopeChange } from '@/lib/spend-envelope';

/** The model-spend envelope (R15). Dollars in the API are CAD; the database holds micros. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const e = await getEnvelope(session.user.id);
  return NextResponse.json({ enabled: e.enabled, dailyCad: e.dailyCadMicros / 1e6, monthlyCad: e.monthlyCadMicros / 1e6, cadPerUsd: e.cadPerUsd });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const o = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const toMicros = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) : NaN);
  const next = parseEnvelope({ enabled: o.enabled, dailyCadMicros: toMicros(o.dailyCad), monthlyCadMicros: toMicros(o.monthlyCad), cadPerUsd: o.cadPerUsd });
  if (!next) return NextResponse.json({ error: 'Daily must be above 0 and not above monthly; rate must be between 0.5 and 5' }, { status: 400 });
  const res = await requestEnvelopeChange(session.user.id, next);
  return res.applied ? NextResponse.json({ success: true }) : NextResponse.json({ requiresApproval: true, approval: res.approval }, { status: 202 });
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { refine } from '@/lib/change-requests/service';

type Ctx = { params: Promise<{ id: string }> };

/** Asks the configured model for a strict spec. With no model: 503 'No model configured', nothing saved. */
export async function POST(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('change_requests', a.userId);
  if (limited) return limited as NextResponse;
  const { id } = await params;
  const res = await refine(a.userId, id);
  if (res === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const v = res.value;
  if (v.kind === 'conflict') return NextResponse.json({ error: 'Only a draft or refined request can be refined' }, { status: 409 });
  if (v.kind === 'unavailable') {
    return NextResponse.json({ error: v.error, reason: v.reason }, { status: v.reason === 'no_model' ? 503 : 502 });
  }
  return NextResponse.json({ changeRequest: v.value });
}

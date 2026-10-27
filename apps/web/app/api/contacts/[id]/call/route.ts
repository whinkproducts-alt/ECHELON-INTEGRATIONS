export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { SCRIPT_MAX, requestCall } from '@/lib/contacts/comms';

const Schema = z.object({ script: z.string().trim().max(SCRIPT_MAX).optional() }).strict();

/** Creates a Class C approval request. No call is placed until the user approves that request id. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('comms', a.userId);
  if (limited) return limited as NextResponse;
  const { id } = await params;
  const b = await readJsonBody(req, 16 * 1024);
  if ('response' in b) return b.response;
  const parsed = Schema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid call request' }, { status: 400 });
  const res = await requestCall(a.userId, id, parsed.data.script);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ approvalId: res.approval.id, approval: res.approval, casl: res.casl, status: 'AWAITING_APPROVAL' }, { status: 202 });
}

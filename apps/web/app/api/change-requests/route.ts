export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { CreateSchema } from '@/lib/change-requests/schema';
import { createChangeRequest, listChangeRequests } from '@/lib/change-requests/service';

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  return NextResponse.json({ changeRequests: await listChangeRequests(a.userId) });
}

/** The body is the owner's own words. It is stored as data and wrapped as untrusted before any model sees it. */
export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('change_requests', a.userId);
  if (limited) return limited as NextResponse;
  const b = await readJsonBody(req, 24 * 1024);
  if ('response' in b) return b.response;
  const parsed = CreateSchema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid change request', issues: parsed.error.flatten() }, { status: 400 });
  const res = await createChangeRequest(a.userId, parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ changeRequest: res.value }, { status: 201 });
}

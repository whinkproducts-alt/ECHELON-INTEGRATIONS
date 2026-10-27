export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { StatusSchema } from '@/lib/change-requests/schema';
import { setStatus } from '@/lib/change-requests/service';

type Ctx = { params: Promise<{ id: string }> };

/** Manual progress update by the owner (SENT to IN_PROGRESS to PR_OPENED to MERGED). A GitHub webhook is future work. */
export async function POST(req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('change_requests', a.userId);
  if (limited) return limited as NextResponse;
  const { id } = await params;
  const b = await readJsonBody(req, 2 * 1024);
  if ('response' in b) return b.response;
  const parsed = StatusSchema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  const res = await setStatus(a.userId, id, parsed.data.status);
  if (res === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (res.value.kind === 'conflict') return NextResponse.json({ error: res.value.error }, { status: 409 });
  return NextResponse.json({ changeRequest: res.value.value });
}

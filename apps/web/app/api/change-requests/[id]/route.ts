export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { PatchSchema } from '@/lib/change-requests/schema';
import { getChangeRequest, toView, updateChangeRequest } from '@/lib/change-requests/service';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await params;
  const row = await getChangeRequest(a.userId, id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ changeRequest: toView(row) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('change_requests', a.userId);
  if (limited) return limited as NextResponse;
  const { id } = await params;
  const b = await readJsonBody(req, 24 * 1024);
  if ('response' in b) return b.response;
  const parsed = PatchSchema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid change request', issues: parsed.error.flatten() }, { status: 400 });
  const res = await updateChangeRequest(a.userId, id, parsed.data);
  if (res === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (res.value.kind === 'conflict') return NextResponse.json({ error: 'Only a draft or refined request can be edited' }, { status: 409 });
  return NextResponse.json({ changeRequest: res.value.value });
}

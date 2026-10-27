export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { ContractPatchSchema, deleteContract, getContract, toView, updateContract } from '@/lib/contracts/service';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await params;
  const row = await getContract(a.userId, id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ contract: toView(row) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('contracts', a.userId);
  if (limited) return limited as NextResponse;
  const { id } = await params;
  const b = await readJsonBody(req, 32 * 1024);
  if ('response' in b) return b.response;
  const parsed = ContractPatchSchema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid contract', issues: parsed.error.flatten() }, { status: 400 });
  const res = await updateContract(a.userId, id, parsed.data);
  if (res === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (res.value.kind === 'project_not_found') return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (res.value.kind === 'bad_dates') return NextResponse.json({ error: 'endDate must not be before startDate' }, { status: 400 });
  return NextResponse.json({ contract: res.value.value });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('contracts', a.userId);
  if (limited) return limited as NextResponse;
  const { id } = await params;
  const res = await deleteContract(a.userId, id);
  if (res === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}

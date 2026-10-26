export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { ContractInputSchema, ListQuerySchema, createContract, listContracts } from '@/lib/contracts/service';

export async function GET(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const q = ListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ error: 'Invalid query', issues: q.error.flatten() }, { status: 400 });
  const res = await listContracts(a.userId, q.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ contracts: res.items, nextCursor: res.nextCursor });
}

export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('contracts', a.userId);
  if (limited) return limited as NextResponse;
  const b = await readJsonBody(req, 32 * 1024);
  if ('response' in b) return b.response;
  const parsed = ContractInputSchema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid contract', issues: parsed.error.flatten() }, { status: 400 });
  const res = await createContract(a.userId, parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (res.value.kind === 'project_not_found') return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (res.value.kind === 'bad_dates') return NextResponse.json({ error: 'endDate must not be before startDate' }, { status: 400 });
  return NextResponse.json({ contract: res.value.value }, { status: 201 });
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { BudgetInputSchema, setBudget } from '@/lib/budget';

export async function PUT(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const b = await readJsonBody(req, 4 * 1024);
  if ('response' in b) return b.response;
  const parsed = BudgetInputSchema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid budget', issues: parsed.error.flatten() }, { status: 400 });
  const res = await setBudget(a.userId, parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ budget: res.value });
}

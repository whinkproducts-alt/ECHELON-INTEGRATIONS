export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { usageSummary, USAGE_RANGES, type UsageRange } from '@/lib/usage';
import { budgetState } from '@/lib/budget';
import { connectivityMode } from '@/lib/offline';

export async function GET(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const range = new URL(req.url).searchParams.get('range') ?? '7d';
  if (!Object.prototype.hasOwnProperty.call(USAGE_RANGES, range)) {
    return NextResponse.json({ error: "range must be '7d' or '30d'" }, { status: 400 });
  }
  const [summary, budget, connectivity] = await Promise.all([
    usageSummary(a.userId, range as UsageRange),
    budgetState(a.userId),
    connectivityMode(),
  ]);
  return NextResponse.json({ ...summary, budget, connectivity });
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { financeSummary } from '@/lib/finance/summary';

// Read-only by design: this folder exports GET only. A test fails if any finance route adds a write method.
export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  return NextResponse.json(await financeSummary(a.userId));
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { limitOr429 } from '@/lib/rate-limit';
import { ledgerFacets } from '@/lib/ledger-search';

/** Distinct actions, statuses, personas and categories with counts for the caller, last 90 days. */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await limitOr429('read', userId);
  if (limited) return limited;
  return NextResponse.json(await ledgerFacets(userId));
}

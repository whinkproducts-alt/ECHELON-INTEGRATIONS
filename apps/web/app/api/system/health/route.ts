export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserWithOwner } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { operatorHealth, userHealth } from '@/lib/system-health';

/** Facts only. Operator-wide facts go to owner accounts; everyone else gets their own scope. */
export async function GET() {
  const a = await requireUserWithOwner();
  if ('response' in a) return a.response;
  const limited = await limitOr429('read', a.userId);
  if (limited) return limited;
  return NextResponse.json(a.owner ? await operatorHealth() : await userHealth());
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserWithOwner } from '@/lib/api-helpers';
import { getBoardMembers } from '@/lib/board';

/** The roster is operator configuration: only owner accounts (WHINK_OWNER_EMAILS) see it. Everyone else gets an empty list. */
export async function GET() {
  const a = await requireUserWithOwner();
  if ('response' in a) return a.response;
  return NextResponse.json({ members: a.owner ? getBoardMembers() : [] });
}

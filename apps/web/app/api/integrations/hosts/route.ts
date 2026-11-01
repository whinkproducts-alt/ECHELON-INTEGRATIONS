export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readJsonBody } from '@/lib/api-helpers';
import { requireOwner, errorResponse } from '@/lib/capability/api';
import { createHost, listHosts, sweepHosts } from '@/lib/capability/hosts';

export async function GET() {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  await sweepHosts(who.userId).catch(() => []); // refresh the display cache and ledger transitions; the live status below does not depend on it
  return NextResponse.json({ hosts: await listHosts(who.userId) });
}

export async function POST(req: Request) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const parsed = await readJsonBody(req);
  if ('response' in parsed) return parsed.response;
  try {
    const { host, token } = await createHost(who.userId, parsed.body as { name: string; kind?: 'LOCAL' | 'REMOTE' });
    // The token appears in this response only. It is stored as a hash and cannot be shown again.
    return NextResponse.json({ host, token, note: 'Store this token now; it is shown once.' }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

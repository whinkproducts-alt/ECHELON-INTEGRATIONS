export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireOwner, errorResponse } from '@/lib/capability/api';
import { revokeGrant } from '@/lib/capability/providers';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  try {
    const { id } = await params;
    await revokeGrant(who.userId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

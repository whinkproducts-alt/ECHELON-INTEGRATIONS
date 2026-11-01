export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireOwner, errorResponse } from '@/lib/capability/api';
import { rotateHostToken } from '@/lib/capability/hosts';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  try {
    const { id } = await params;
    return NextResponse.json({ ...(await rotateHostToken(who.userId, id)), note: 'The previous token no longer works. Shown once.' });
  } catch (e) {
    return errorResponse(e);
  }
}

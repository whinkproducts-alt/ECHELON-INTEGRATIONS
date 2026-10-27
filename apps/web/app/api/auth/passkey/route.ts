export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/api-helpers';
import { passkeyLimit } from '@/lib/passkeys/guard';

export async function GET(req: Request) {
  const u = await requireUserId();
  if ('response' in u) return u.response;
  const limited = await passkeyLimit(req, u.userId);
  if (limited) return limited;
  const rows = await prisma.passkeyCredential.findMany({
    where: { userId: u.userId },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ passkeys: rows }, { headers: { 'cache-control': 'no-store' } });
}

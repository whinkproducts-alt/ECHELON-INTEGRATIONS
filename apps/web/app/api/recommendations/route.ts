export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';

const QuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();

/** Own, undismissed recommendations, newest first. */
export async function GET(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('recommendations', a.userId);
  if (limited) return limited;
  const q = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  const rows = await prisma.recommendation.findMany({
    where: { userId: a.userId, dismissedAt: null },
    orderBy: { createdAt: 'desc' },
    take: q.data.limit,
    select: { id: true, source: true, kind: true, title: true, body: true, link: true, severity: true, createdAt: true },
  });
  return NextResponse.json({ items: rows });
}

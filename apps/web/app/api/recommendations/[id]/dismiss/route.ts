export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { runGuarded } from '@/lib/guarded-action';

const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);

/** Dismiss one of the caller's own recommendations. Another user's id is a 404 and nothing changes. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('recommendations', a.userId);
  if (limited) return limited;
  const id = IdSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const res = await runGuarded(
    { userId: a.userId, capability: 'recommendation_write', permissionClass: 'A', action: 'recommendation_dismissed', summary: `id=${id.data}` },
    async () => {
      const r = await prisma.recommendation.updateMany({ where: { id: id.data, userId: a.userId, dismissedAt: null }, data: { dismissedAt: new Date() } });
      return r.count;
    },
  );
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (res.value === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

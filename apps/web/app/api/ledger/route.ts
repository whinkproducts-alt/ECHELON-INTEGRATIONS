export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '50');
  const actions = await prisma.action.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
  return NextResponse.json(actions);
}

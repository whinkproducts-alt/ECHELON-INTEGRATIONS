export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const entities = await prisma.entityNode.findMany({
    where: { userId: session.user.id, mergedInto: null },
    include: { aliases: true, edgesFrom: { where: { supersededBy: null }, include: { to: { select: { canonicalName: true, type: true } } } } },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json(entities);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const entity = await prisma.entityNode.create({
    data: {
      userId: session.user.id,
      type: body.type ?? 'PERSON',
      canonicalName: body.name,
      confidence: body.confidence ?? 0.8,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
    },
  });
  if (body.aliases?.length) {
    for (const alias of body.aliases) {
      await prisma.entityAlias.create({ data: { entityId: entity.id, alias } });
    }
  }
  return NextResponse.json(entity);
}

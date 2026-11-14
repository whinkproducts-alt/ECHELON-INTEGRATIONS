import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const objectives = await prisma.sealedObjective.findMany({
      where: { userId: session.user.id, status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ 
      objectives: objectives.map(o => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        completedAt: o.completedAt?.toISOString() || null,
      }))
    });
  } catch (error) {
    console.error('Error listing sealed objectives:', error);
    return NextResponse.json({ error: 'Failed to list sealed objectives' }, { status: 500 });
  }
}
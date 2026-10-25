export const dynamic = 'force-dynamic';

// PIPEDA Q2: users must be able to list all memories held about them and delete any.
// This route serves the GET half; DELETE /api/memory/[id] handles deletion.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = req.nextUrl;
  const cursor = searchParams.get('cursor') ?? undefined;
  const rawLimit = parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10);
  const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_PAGE_SIZE : rawLimit, MAX_PAGE_SIZE);
  const type = searchParams.get('type') ?? undefined; // semantic | episodic | hypothesis | procedural

  // Each memory type is in its own table. Return a unified list, scoped to this user only.

  if (!type || type === 'semantic') {
    const rows = await prisma.memorySemantic.findMany({
      where: { userId, supersededBy: null, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        statement: true,
        epistemicStatus: true,
        confidence: true,
        source: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      type: 'semantic',
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    });
  }

  if (type === 'episodic') {
    const rows = await prisma.memoryEpisode.findMany({
      where: { userId, supersededBy: null, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        summary: true,
        eventType: true,
        eventDate: true,
        confidence: true,
        source: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      type: 'episodic',
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    });
  }

  if (type === 'hypothesis') {
    const rows = await prisma.hypothesis.findMany({
      where: { userId, supersededBy: null, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        statement: true,
        confidence: true,
        source: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      type: 'hypothesis',
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    });
  }

  if (type === 'procedural') {
    const rows = await prisma.memoryProcedural.findMany({
      where: { userId, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        description: true,
        steps: true,
        confidence: true,
        source: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      type: 'procedural',
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    });
  }

  return NextResponse.json({ error: 'Invalid type. Use: semantic, episodic, hypothesis, procedural' }, { status: 400 });
}

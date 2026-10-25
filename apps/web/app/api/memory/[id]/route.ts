export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { recordActionSafe } from '@/lib/ledger';

type Params = { params: { id: string } };

/**
 * PATCH /api/memory/[id]
 * Update a semantic memory's statement or epistemicStatus.
 * Scoped by userId — no cross-user access.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = params;

  let body: { statement?: string; epistemicStatus?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { statement, epistemicStatus } = body;
  if (!statement && !epistemicStatus) {
    return NextResponse.json({ error: 'statement or epistemicStatus required' }, { status: 400 });
  }

  // Only allow valid epistemicStatus values
  const validStatuses = ['KNOWN', 'INFERRED', 'HYPOTHESIS', 'UNVERIFIED'];
  if (epistemicStatus && !validStatuses.includes(epistemicStatus)) {
    return NextResponse.json({ error: 'Invalid epistemicStatus' }, { status: 400 });
  }

  // Attempt to find and update MemorySemantic scoped by userId
  const existing = await prisma.memorySemantic.findFirst({
    where: { id, userId },
    select: { id: true, epistemicStatus: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
  }

  const updateData: Record<string, string> = {};
  if (statement) updateData.statement = statement.slice(0, 4000);
  if (epistemicStatus) updateData.epistemicStatus = epistemicStatus;

  const updated = await prisma.memorySemantic.update({
    where: { id },
    data: updateData,
    select: { id: true, statement: true, epistemicStatus: true, updatedAt: true },
  });

  const action = epistemicStatus === 'KNOWN' ? 'memory_confirmed' : 'memory_corrected';
  await recordActionSafe({
    userId,
    initiator: 'user',
    action,
    permissionClass: 'A',
    status: 'SUBMITTED',
    tool: 'memory_patch',
    inputSummary: `id=${id}`,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/memory/[id]
 * Delete a semantic memory by id, scoped by userId.
 * Ledgers memory_deleted with the memory id — no statement content in the ledger.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = params;

  // Attempt MemorySemantic first
  const semantic = await prisma.memorySemantic.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (semantic) {
    // NULL the embedding before deleting to remove pgvector data cleanly
    await prisma.$executeRaw`UPDATE "memory_semantic" SET "embedding" = NULL WHERE "id" = ${id} AND "userId" = ${userId}`;
    await prisma.memorySemantic.delete({ where: { id } });

    await recordActionSafe({
      userId,
      initiator: 'user',
      action: 'memory_deleted',
      permissionClass: 'A',
      status: 'SUBMITTED',
      tool: 'memory_delete',
      inputSummary: `id=${id} type=semantic`,
    });

    return NextResponse.json({ deleted: true });
  }

  // Fallback: try MemoryEpisode
  const episode = await prisma.memoryEpisode.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (episode) {
    await prisma.$executeRaw`UPDATE "memory_episodes" SET "embedding" = NULL WHERE "id" = ${id} AND "userId" = ${userId}`;
    await prisma.memoryEpisode.delete({ where: { id } });

    await recordActionSafe({
      userId,
      initiator: 'user',
      action: 'memory_deleted',
      permissionClass: 'A',
      status: 'SUBMITTED',
      tool: 'memory_delete',
      inputSummary: `id=${id} type=episode`,
    });

    return NextResponse.json({ deleted: true });
  }

  return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
}

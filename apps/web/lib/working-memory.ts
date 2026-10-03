/**
 * Working memory — persistent KV store backed by Postgres via Prisma.
 * Replaces the previous in-process Map (lost on restart).
 *
 * All keys are scoped by userId (tenant isolation).
 */

import { prisma } from '@/lib/db';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export async function setWorkingMemory(
  userId: string,
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  const expiresAt = ttlSeconds != null
    ? new Date(Date.now() + ttlSeconds * 1000)
    : new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000);

  await prisma.workingMemory.upsert({
    where: { userId_key: { userId, key } },
    update: { value, expiresAt },
    create: { userId, key, value, expiresAt },
  });
}

export async function getWorkingMemory(
  userId: string,
  key: string,
): Promise<string | null> {
  const row = await prisma.workingMemory.findUnique({
    where: { userId_key: { userId, key } },
  });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt < new Date()) {
    // Row expired — clean up and return null
    await prisma.workingMemory.delete({ where: { userId_key: { userId, key } } }).catch(() => {/* already gone */});
    return null;
  }
  return row.value;
}

export async function clearWorkingMemory(userId: string, key?: string): Promise<void> {
  if (key != null) {
    await prisma.workingMemory.deleteMany({ where: { userId, key } });
  } else {
    await prisma.workingMemory.deleteMany({ where: { userId } });
  }
}

/**
 * List all non-expired working memory entries for a user.
 * Returns entries in creation order (oldest first).
 */
export async function listWorkingMemory(
  userId: string,
): Promise<Array<{ key: string; value: string; expiresAt: Date | null }>> {
  return prisma.workingMemory.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'asc' },
    select: { key: true, value: true, expiresAt: true },
  });
}

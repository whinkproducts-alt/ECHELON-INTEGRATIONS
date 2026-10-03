import { prisma } from '@/lib/db';

/** True when a caller supplied a projectId value that must be verified (null, undefined and '' mean "no project"). */
export function hasProjectId(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Returns the verified project id when `projectId` is a non-empty string and the
 * project is owned by `userId`; otherwise null. Call before any write that stores a projectId.
 */
export async function assertOwnedProject(userId: string, projectId: unknown): Promise<string | null> {
  if (typeof projectId !== 'string' || projectId.length === 0) return null;
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    select: { id: true },
  });
  return project?.id ?? null;
}

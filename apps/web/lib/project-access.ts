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

/** Prisma where-fragment for projects the user owns or is a member of. Always combine with other filters via AND. */
export function accessibleProjectWhere(userId: string) {
  return { OR: [{ ownerId: userId }, { members: { some: { userId } } }] };
}

/** True when the user owns the project (members may read but not reassign). */
export async function isProjectOwner(userId: string, projectId: string): Promise<boolean> {
  return (await assertOwnedProject(userId, projectId)) !== null;
}

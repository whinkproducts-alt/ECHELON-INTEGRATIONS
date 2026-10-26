import { prisma } from '@/lib/db';

/**
 * User.sessionVersion is copied into the JWT at sign-in and compared on every read. Bumping it
 * signs out every other session of the user (stolen cookie, old device). Call bumpSessionVersion
 * whenever a credential is added or removed or the password changes (there is no password-change
 * route yet: the first one MUST call this).
 *
 * Reads are cached for CACHE_MS per process to avoid a query on every request; a bump clears the
 * local entry, other processes see it within CACHE_MS.
 */
const CACHE_MS = 15_000;
const cache = new Map<string, { v: number; at: number }>();

export async function getSessionVersion(userId: string, now: number = Date.now()): Promise<number | null> {
  const hit = cache.get(userId);
  if (hit && now - hit.at < CACHE_MS) return hit.v;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  if (!u) {
    cache.delete(userId);
    return null;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(userId, { v: u.sessionVersion, at: now });
  return u.sessionVersion;
}

export async function bumpSessionVersion(userId: string): Promise<number> {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  cache.delete(userId);
  return u.sessionVersion;
}

export function clearSessionVersionCache(): void {
  cache.clear();
}

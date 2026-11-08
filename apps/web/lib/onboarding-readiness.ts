import { prisma } from '@/lib/db';

/** Fresh, account-scoped admission data; never fetch full settings or cache authority. */
export async function isOnboardingComplete(userId: string): Promise<boolean> {
  if (!userId) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const profile = await Promise.race([
      prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness lookup timed out')), 3000); }),
    ]);
    return Boolean(profile?.displayName);
  } finally { clearTimeout(timer); }
}

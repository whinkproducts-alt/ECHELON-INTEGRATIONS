/**
 * Who may use the workspace tools. The workspace belongs to the operator's machine, so only an
 * OWNER account may offer or run them (WHINK_OWNER_EMAILS, exact case-insensitive match, see
 * lib/owner.ts). The email is looked up from the database by user id; the session is not trusted
 * for it. Unknown user, no email or a lookup error means no.
 */
import { prisma } from '@/lib/db';
import { isOwnerEmail } from '@/lib/owner';

export async function canUseWorkspaceTools(userId: string): Promise<boolean> {
  if (!userId || typeof userId !== 'string') return false;
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return isOwnerEmail(u?.email);
  } catch {
    return false;
  }
}

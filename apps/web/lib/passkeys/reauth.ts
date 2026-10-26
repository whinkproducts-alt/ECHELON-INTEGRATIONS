import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { limitOr429 } from '@/lib/rate-limit';
import { redeemReauthTicket } from './challenges';
import { passkeySecurityEvent } from './guard';

/** Body shape for routes that need a fresh credential: exactly one of password or ticket. */
export const ReauthFields = {
  password: z.string().min(1).max(256).optional(),
  ticket: z.string().min(1).max(200).optional(),
};
export const hasOneReauth = (b: { password?: string; ticket?: string }) => (b.password === undefined) !== (b.ticket === undefined);

export type ReauthResult = 'ok' | 'denied' | 'limited';

/**
 * Verify a recent re-authentication for this session user: the account password (bcrypt, rate
 * limited per user) or a single-use re-auth ticket from a passkey assertion (5 minute life).
 */
export async function verifyReauth(userId: string, input: { password?: string; ticket?: string }): Promise<ReauthResult> {
  if ((await limitOr429('passkey_reauth', userId)) !== null) return 'limited';
  let ok = false;
  if (input.ticket !== undefined) {
    ok = await redeemReauthTicket(input.ticket, userId);
  } else if (input.password !== undefined) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    ok = !!u?.passwordHash && (await bcrypt.compare(input.password, u.passwordHash));
  }
  if (!ok) {
    await passkeySecurityEvent(userId, 'passkey_reauth_failed', { method: input.ticket !== undefined ? 'ticket' : 'password' });
    return 'denied';
  }
  return 'ok';
}

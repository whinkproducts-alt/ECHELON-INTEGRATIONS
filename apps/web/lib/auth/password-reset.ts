import { createHash, randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { writeLedger } from '@/lib/ledger';
import { checkPermission } from '@/lib/permission-engine';
import { deliver } from '@/lib/comms/delivery';
import { bumpSessionVersion, clearSessionVersionCache } from '@/lib/auth/session-version';

export const RESET_TTL_MS = 30 * 60_000;

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const emailHash = (e: string) => createHash('sha256').update(e.trim().toLowerCase()).digest('hex').slice(0, 32);

/** Create a token for an existing, password-bearing account and mail the link. Never throws. */
export async function issueAndSend(rawEmail: string, now: Date = new Date()): Promise<void> {
  const correlationId = randomUUID();
  try {
    const user = await prisma.user.findUnique({
      where: { email: rawEmail.trim().toLowerCase() },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user || !user.passwordHash) return;

    const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    const perm = await checkPermission(user.id, 'password_reset_email', 'A', correlationId);
    if (!perm.allowed) return;

    // A still-valid link issued under 60 s ago stands: no retire, no new token, no mail. This stops
    // a stranger from repeatedly killing the owner's fresh link.
    const fresh = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now }, createdAt: { gt: new Date(now.getTime() - 60_000) } },
      select: { id: true },
    });
    if (fresh) return;

    const token = randomBytes(32).toString('base64url');
    // New token first, then retire older unused ones (never the new one), so a failure leaves a valid token.
    const created = await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) },
      select: { id: true },
    });
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, id: { not: created.id } },
      data: { usedAt: now },
    });

    let outcome = 'sent';
    if (!base) {
      outcome = 'no_base_url';
      logger.warn('password reset email not sent: AUTH_URL not configured');
    } else if (!process.env.SMTP_HOST) {
      outcome = 'smtp_not_configured';
      logger.warn('password reset email not sent: SMTP not configured');
    } else {
      const link = `${base.replace(/\/+$/, '')}/reset-password?token=${token}`;
      const r = await deliver({
        channel: 'EMAIL',
        to: user.email,
        userId: user.id,
        subject: 'Reset your password',
        body: `Use this link within 30 minutes to reset your password:\n\n${link}\n\nIf you did not ask for this, ignore this message.`,
      });
      if (!r.sent) {
        outcome = 'not_sent';
        logger.warn('password reset email not sent', { reason: r.reason ?? 'unknown' });
      }
    }
    await writeLedger({
      userId: user.id, action: 'password_reset_email', tool: 'password_reset_email', permissionClass: 'A',
      status: outcome === 'sent' ? 'EXECUTED' : 'FAILED', initiator: 'system', persona: 'WHINK', correlationId,
      metadata: { outcome },
    });
  } catch {
    logger.error('password reset request failed');
  }
}

export type ResetResult = 'ok' | 'invalid_or_expired';

/** Atomically consume the token and set the password, then revoke every session. */
export async function resetPassword(token: string, password: string, now: Date = new Date()): Promise<ResetResult> {
  const tokenHash = hashToken(token);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, select: { userId: true, usedAt: true, expiresAt: true } });
  if (!row || row.usedAt || row.expiresAt <= now) return 'invalid_or_expired';

  const passwordHash = await bcrypt.hash(password, 12);
  const won = await prisma.$transaction(async (tx) => {
    const c = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (c.count !== 1) return false;
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    // Same transaction: if the bump fails, the password and token consumption roll back too.
    await bumpSessionVersion(row.userId, tx);
    return true;
  });
  if (!won) return 'invalid_or_expired';
  clearSessionVersionCache(); // a read between the in-tx clear and the commit may have cached the old value
  await writeLedger({
    userId: row.userId, action: 'password_reset', permissionClass: 'A', status: 'EXECUTED',
    initiator: 'user', persona: 'WHINK', correlationId: randomUUID(), metadata: { outcome: 'success' },
  });
  return 'ok';
}

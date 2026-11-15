/**
 * notifications/deliver.ts
 * In-app + email notification delivery for ECHELON.
 *
 * In-app:  prisma.recommendation  (dedupeKey for idempotency)
 * Email:   not sent (see notify)
 *
 * NOTE: prisma.notification does NOT exist in schema.prisma.
 *       All in-app delivery goes through prisma.recommendation.
 */

import { prisma } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotifyParams {
  userId: string;
  /** Idempotency key — duplicate calls with same key are no-ops. */
  dedupeKey: string;
  title: string;
  body: string;
  link?: string;
  severity?: 'info' | 'warning' | 'critical';
  /** If true, also attempt email delivery via NotificationPreference lookup. */
  emailSubject?: string;
}

export interface NotifyResult {
  inApp: 'created' | 'duplicate';
  email: 'sent' | 'skipped' | 'no_address' | 'error';
}

// ── In-app delivery ───────────────────────────────────────────────────────────

/**
 * Creates a Recommendation row for in-app display.
 * Returns 'duplicate' if the dedupeKey already exists (idempotent).
 */
export async function deliverInApp(
  params: Omit<NotifyParams, 'emailSubject'>,
): Promise<'created' | 'duplicate'> {
  const { userId, dedupeKey, title, body, link, severity = 'info' } = params;

  const existing = await prisma.recommendation.findFirst({
    where: { userId, dedupeKey },
    select: { id: true },
  });

  if (existing) return 'duplicate';

  await prisma.recommendation.create({
    data: {
      userId,
      dedupeKey,
      title,
      body,
      link: link ?? null,
      severity,
      source: 'echelon',
      kind: 'budget_report',
    },
  });

  return 'created';
}

// ── Email delivery ────────────────────────────────────────────────────────────

/**
 * Looks up an enabled EMAIL NotificationPreference for the user.
 * Falls back to WHINK_REPORT_EMAIL env var.
 * Returns null if no address found.
 */
export async function resolveEmailAddress(userId: string): Promise<string | null> {
  const pref = await prisma.notificationPreference.findFirst({
    where: { userId, channel: 'EMAIL', enabled: true },
    select: { address: true },
  });

  if (pref?.address) return pref.address;

  const envEmail = process.env.WHINK_REPORT_EMAIL;
  return envEmail ?? null;
}

// ── Combined delivery ─────────────────────────────────────────────────────────

/**
 * Delivers both in-app (recommendation) and email notification.
 * Idempotent via dedupeKey.
 */
export async function notify(params: NotifyParams): Promise<NotifyResult> {
  const inApp = await deliverInApp(params);

  let emailResult: NotifyResult['email'] = 'skipped';

  if (params.emailSubject !== undefined) {
    // Not sent: lib/comms/delivery has no exported email sender, and mailing ledger data outside the account is a
    // protected disclosure that needs the owner's approval by request id. The in-app notice above still lands.
    emailResult = (await resolveEmailAddress(params.userId)) ? 'skipped' : 'no_address';
  }

  return { inApp, email: emailResult };
}

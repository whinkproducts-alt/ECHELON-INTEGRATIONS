/**
 * Item 29: what is still missing before the owner account is fully usable. Reads state only; creates nothing.
 * Enrolling a passkey needs the owner's own device, so the last two steps are always "Needs Victor".
 * Returns step ids and plain next actions, never emails, keys or credential ids.
 */
import { prisma } from '@/lib/db';
import { ownerEmails } from '@/lib/owner';
import { getWebAuthnConfig } from '@/lib/passkeys/config';

export interface ReadinessStep { id: string; ok: boolean; needsVictor: boolean; next: string | null }

export async function ownerReadiness(env: Record<string, string | undefined> = process.env): Promise<{ ready: boolean; steps: ReadinessStep[] }> {
  const steps: ReadinessStep[] = [];
  const add = (id: string, ok: boolean, next: string, needsVictor = false) => steps.push({ id, ok, needsVictor, next: ok ? null : next });

  const owners = [...ownerEmails(env)];
  add('owner_email_configured', owners.length > 0, 'Set WHINK_OWNER_EMAILS in .env.local to the owner email.', true);

  let webauthnOk = true;
  try { getWebAuthnConfig(env); } catch { webauthnOk = false; }
  add('webauthn_configured', webauthnOk, 'Set WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN (https, or localhost) in .env.local.', true);

  const user = owners.length ? await prisma.user.findFirst({ where: { email: { in: owners } }, select: { id: true, passwordHash: true } }) : null;
  add('owner_account_exists', !!user, 'Create the owner account with the owner email (sign-up page).', true);
  add('owner_has_password', !!user?.passwordHash, 'Set a password: it is the recovery route if a passkey device is lost.', true);

  const count = user ? await prisma.passkeyCredential.count({ where: { userId: user.id } }) : 0;
  add('passkey_enrolled', count >= 1, 'Settings, Passkeys, Add passkey on your own device (needs your device and biometrics).', true);
  add('second_passkey_for_recovery', count >= 2, 'Add a second passkey (another device or a security key) so losing one device does not lock you out.', true);

  return { ready: steps.every((s) => s.ok), steps };
}

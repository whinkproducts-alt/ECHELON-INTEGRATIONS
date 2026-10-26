export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { loadConfig, passkeyCsrf, passkeyLimit, ledgerPasskey, passkeySecurityEvent } from '@/lib/passkeys/guard';
import { consumeChallenge, mintLoginTicket } from '@/lib/passkeys/challenges';
import { bumpSessionVersion } from '@/lib/auth/session-version';

const Body = z
  .object({
    challengeId: z.string().min(1).max(64),
    deviceName: z.string().trim().min(1).max(80).optional(),
    response: z.object({ id: z.string().min(1).max(1024) }).passthrough(),
  })
  .strict();

export async function POST(req: Request) {
  const csrf = passkeyCsrf(req);
  if (csrf) return csrf;
  const u = await requireUserId();
  if ('response' in u) return u.response;
  const limited = await passkeyLimit(req, u.userId);
  if (limited) return limited;
  const cfg = loadConfig();
  if ('response' in cfg) return cfg.response;

  const parsed = await readJsonBody(req, 32 * 1024);
  if ('response' in parsed) return parsed.response;
  const body = Body.safeParse(parsed.body);
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const ch = await consumeChallenge(body.data.challengeId, 'register', { userId: u.userId });
  if (!ch) return NextResponse.json({ error: 'Challenge expired or already used' }, { status: 400 });

  let info;
  try {
    const v = await verifyRegistrationResponse({
      response: body.data.response as any,
      expectedChallenge: ch.challenge,
      expectedOrigin: cfg.cfg.origins,
      expectedRPID: cfg.cfg.rpID,
      requireUserVerification: true,
    });
    if (!v.verified || !v.registrationInfo || v.registrationInfo.userVerified !== true) throw new Error('not verified');
    info = v.registrationInfo;
  } catch (e) {
    const origin = /origin/i.test((e as Error)?.message ?? '');
    await passkeySecurityEvent(u.userId, origin ? 'passkey_origin_mismatch' : 'passkey_register_failed', { phase: 'register' });
    return NextResponse.json({ error: 'Passkey registration failed' }, { status: 400 });
  }

  const taken = await prisma.passkeyCredential.findUnique({ where: { credentialId: info.credential.id }, select: { id: true } });
  if (taken) return NextResponse.json({ error: 'Passkey already registered' }, { status: 409 });

  // Revoke other sessions FIRST: if this throws, no credential was added. (Bump clears the local cache.)
  await bumpSessionVersion(u.userId);
  const row = await prisma.passkeyCredential.create({
    data: {
      userId: u.userId,
      credentialId: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey),
      counter: BigInt(info.credential.counter ?? 0),
      transports: (info.credential.transports as string[] | undefined) ?? [],
      deviceName: body.data.deviceName ?? 'This device',
      backedUp: info.credentialBackedUp === true,
    },
    select: { id: true, deviceName: true, createdAt: true },
  });
  await ledgerPasskey(u.userId, 'passkey_registered', 'EXECUTED', { passkeyId: row.id });
  // Owner-visible notice (Neural Link shows SECURITY_EVENT rows).
  await passkeySecurityEvent(u.userId, 'credential_added', { passkeyId: row.id, kind: 'passkey' }, 'EXECUTED');
  // Adding a credential signs out every session of this user, including this one. Hand back a
  // one-time ticket so the client can sign straight back in with signIn('passkey', { ticket }).
  const remember = ((await auth())?.user as { remember?: boolean } | undefined)?.remember === true;
  const ticket = await mintLoginTicket(u.userId, remember);
  return NextResponse.json(
    { passkey: { id: row.id, deviceName: row.deviceName, createdAt: row.createdAt }, ticket, expiresInSeconds: 60 },
    { status: 201, headers: { 'cache-control': 'no-store' } },
  );
}

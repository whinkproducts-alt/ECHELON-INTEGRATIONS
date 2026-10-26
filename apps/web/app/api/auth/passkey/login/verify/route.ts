export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { prisma } from '@/lib/db';
import { readJsonBody } from '@/lib/api-helpers';
import { loadConfig, passkeyCsrf, passkeyLimit, ledgerPasskey, passkeySecurityEvent } from '@/lib/passkeys/guard';
import { consumeChallenge, mintLoginTicket } from '@/lib/passkeys/challenges';

const Body = z
  .object({
    challengeId: z.string().min(1).max(64),
    response: z.object({ id: z.string().min(1).max(1024) }).passthrough(),
  })
  .strict();

const fail = () => NextResponse.json({ error: 'Passkey sign-in failed' }, { status: 401 });

export async function POST(req: Request) {
  const csrf = passkeyCsrf(req);
  if (csrf) return csrf;
  const limited = await passkeyLimit(req, null);
  if (limited) return limited;
  const cfg = loadConfig();
  if ('response' in cfg) return cfg.response;

  const parsed = await readJsonBody(req, 32 * 1024);
  if ('response' in parsed) return parsed.response;
  const body = Body.safeParse(parsed.body);
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const ch = await consumeChallenge(body.data.challengeId, 'login');
  if (!ch) return fail();

  const cred = await prisma.passkeyCredential.findUnique({ where: { credentialId: body.data.response.id } });
  if (!cred) {
    await passkeySecurityEvent(null, 'passkey_unknown_credential');
    return fail();
  }

  // Discoverable credentials return the user handle we set at registration (the user id).
  const handle = (body.data.response as any)?.response?.userHandle;
  if (typeof handle === 'string' && handle.length > 0) {
    let decoded = '';
    try { decoded = Buffer.from(handle, 'base64url').toString('utf8'); } catch { /* mismatch below */ }
    if (decoded !== cred.userId) {
      await passkeySecurityEvent(cred.userId, 'passkey_user_mismatch');
      return fail();
    }
  }

  let newCounter: number;
  try {
    const v = await verifyAuthenticationResponse({
      response: body.data.response as any,
      expectedChallenge: ch.challenge,
      expectedOrigin: cfg.cfg.origins,
      expectedRPID: cfg.cfg.rpID,
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(cred.publicKey),
        counter: Number(cred.counter),
        transports: cred.transports as any,
      },
      requireUserVerification: true,
    });
    if (!v.verified || v.authenticationInfo?.userVerified !== true) throw new Error('not verified');
    newCounter = v.authenticationInfo.newCounter;
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    const event = /origin/i.test(msg) ? 'passkey_origin_mismatch' : /counter/i.test(msg) ? 'passkey_replay' : 'passkey_assertion_invalid';
    await passkeySecurityEvent(cred.userId, event);
    return fail();
  }

  // Own counter rule (does not rely on the library alone): must advance unless both are zero.
  const stored = cred.counter;
  if ((newCounter > 0 || stored > 0n) && BigInt(newCounter) <= stored) {
    await passkeySecurityEvent(cred.userId, 'passkey_replay');
    return fail();
  }
  // Conditional update: a concurrent use of the same assertion advances the counter once only.
  const upd = await prisma.passkeyCredential.updateMany({
    where: { id: cred.id, userId: cred.userId, counter: stored },
    data: { counter: BigInt(newCounter), lastUsedAt: new Date() },
  });
  if (upd.count !== 1) {
    await passkeySecurityEvent(cred.userId, 'passkey_replay');
    return fail();
  }

  const ticket = await mintLoginTicket(cred.userId, ch.remember);
  await ledgerPasskey(cred.userId, 'passkey_login', 'EXECUTED', { passkeyId: cred.id, remember: ch.remember });
  return NextResponse.json({ ticket, expiresInSeconds: 60 }, { headers: { 'cache-control': 'no-store' } });
}

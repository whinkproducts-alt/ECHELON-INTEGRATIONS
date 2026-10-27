export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { prisma } from '@/lib/db';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { loadConfig, passkeyCsrf, passkeyLimit } from '@/lib/passkeys/guard';
import { issueChallenge, maybeCleanupChallenges, tooManyOpenChallenges } from '@/lib/passkeys/challenges';
import { ReauthFields, hasOneReauth, verifyReauth } from '@/lib/passkeys/reauth';

const Body = z.object(ReauthFields).strict().refine(hasOneReauth);
const MAX_PASSKEYS = 10;

export async function POST(req: Request) {
  const csrf = passkeyCsrf(req);
  if (csrf) return csrf;
  const u = await requireUserId();
  if ('response' in u) return u.response;
  const limited = await passkeyLimit(req, u.userId);
  if (limited) return limited;
  const cfg = loadConfig();
  if ('response' in cfg) return cfg.response;

  const parsed = await readJsonBody(req, 2 * 1024);
  if ('response' in parsed) return parsed.response;
  const body = Body.safeParse(parsed.body);
  if (!body.success) return NextResponse.json({ error: 'Invalid request: send password or ticket' }, { status: 400 });

  const re = await verifyReauth(u.userId, body.data);
  if (re === 'limited') return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (re === 'denied') return NextResponse.json({ error: 'Re-authentication failed' }, { status: 403 });
  void maybeCleanupChallenges();
  if (await tooManyOpenChallenges(`u:${u.userId}`, 'register')) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { id: true, email: true, name: true } });
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const existing = await prisma.passkeyCredential.findMany({
    where: { userId: u.userId },
    select: { credentialId: true, transports: true },
  });
  if (existing.length >= MAX_PASSKEYS) return NextResponse.json({ error: 'Passkey limit reached' }, { status: 409 });

  const options = await generateRegistrationOptions({
    rpName: cfg.cfg.rpName,
    rpID: cfg.cfg.rpID,
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports as any })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  const challengeId = await issueChallenge('register', options.challenge, { userId: u.userId, clientKey: `u:${u.userId}` });
  return NextResponse.json({ options, challengeId }, { headers: { 'cache-control': 'no-store' } });
}

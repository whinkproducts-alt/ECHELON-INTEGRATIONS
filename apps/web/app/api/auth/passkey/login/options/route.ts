export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { readJsonBody, requireUserId } from '@/lib/api-helpers';
import { loadConfig, passkeyCsrf, passkeyLimit, challengeBucket } from '@/lib/passkeys/guard';
import { issueChallenge, maybeCleanupChallenges, tooManyOpenChallenges } from '@/lib/passkeys/challenges';

const Body = z.object({ remember: z.boolean().optional(), reauth: z.boolean().optional() }).strict();

export async function POST(req: Request) {
  const csrf = passkeyCsrf(req);
  if (csrf) return csrf;
  const limited = await passkeyLimit(req, null);
  if (limited) return limited;
  const cfg = loadConfig();
  if ('response' in cfg) return cfg.response;

  const parsed = await readJsonBody(req, 2 * 1024);
  if ('response' in parsed) return parsed.response;
  const body = Body.safeParse(parsed.body);
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  // reauth: a signed-in user proves possession of a passkey (needed to add or remove one).
  let reauthUser: string | null = null;
  if (body.data.reauth === true) {
    const u = await requireUserId();
    if ('response' in u) return u.response;
    reauthUser = u.userId;
  }
  void maybeCleanupChallenges();
  const bucket = reauthUser ? `u:${reauthUser}` : challengeBucket(req);
  const purpose = reauthUser ? 'reauth' : 'login';
  if (await tooManyOpenChallenges(bucket, purpose)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  // No allowCredentials: discoverable credentials, so no email is needed.
  const options = await generateAuthenticationOptions({ rpID: cfg.cfg.rpID, userVerification: 'required' });
  const challengeId = await issueChallenge(purpose, options.challenge, {
    remember: body.data.remember === true,
    userId: reauthUser,
    clientKey: bucket,
  });
  return NextResponse.json({ options, challengeId }, { headers: { 'cache-control': 'no-store' } });
}

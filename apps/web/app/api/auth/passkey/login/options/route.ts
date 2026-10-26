export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { readJsonBody } from '@/lib/api-helpers';
import { loadConfig, passkeyCsrf, passkeyLimit } from '@/lib/passkeys/guard';
import { issueChallenge } from '@/lib/passkeys/challenges';

const Body = z.object({ remember: z.boolean().optional() }).strict();

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

  // No allowCredentials: discoverable credentials, so no email is needed.
  const options = await generateAuthenticationOptions({ rpID: cfg.cfg.rpID, userVerification: 'required' });
  const challengeId = await issueChallenge('login', options.challenge, { remember: body.data.remember === true });
  return NextResponse.json({ options, challengeId }, { headers: { 'cache-control': 'no-store' } });
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api-helpers';
import { clientKey, limitOr429 } from '@/lib/rate-limit';
import { hashToken, resetPassword } from '@/lib/auth/password-reset';
import { isStrongEnough } from '@/lib/auth/password-policy';
import { logger } from '@/lib/logger';

const Body = z.object({ token: z.string().min(1).max(256), password: z.string().min(1).max(1024) }).strict();
const INVALID = () => NextResponse.json({ error: 'invalid_or_expired' }, { status: 400 });

export async function POST(req: NextRequest) {
  const addr = clientKey(req.headers);
  const limited = addr
    ? await limitOr429('password_reset', addr)
    : await limitOr429('password_reset_route', 'reset');
  if (limited) return limited as NextResponse;

  const parsed = await readJsonBody(req, 4 * 1024);
  if ('response' in parsed) return parsed.response;
  const b = Body.safeParse(parsed.body);
  if (!b.success) return INVALID();

  if (!isStrongEnough(b.data.password)) return NextResponse.json({ error: 'weak_password' }, { status: 400 });

  // Per token-hash bucket: stops guessing a single token from many addresses.
  const limitedTok = await limitOr429('password_reset_account', hashToken(b.data.token).slice(0, 32));
  if (limitedTok) return limitedTok as NextResponse;

  try {
    const r = await resetPassword(b.data.token, b.data.password);
    if (r !== 'ok') {
      logger.security('password reset rejected: invalid or expired token', { path: '/api/auth/password/reset' });
      return INVALID();
    }
    return NextResponse.json({ ok: true });
  } catch {
    logger.error('password reset failed');
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}

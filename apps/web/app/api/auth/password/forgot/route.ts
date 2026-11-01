export const dynamic = 'force-dynamic';
import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api-helpers';
import { clientKey, limitOr429 } from '@/lib/rate-limit';
import { emailHash, issueAndSend } from '@/lib/auth/password-reset';

const Body = z.object({ email: z.string().trim().min(3).max(254) }).strict();

/** Always 200 {ok:true}: the work runs after the response, so neither body nor timing shows whether the account exists. */
export async function POST(req: NextRequest) {
  const addr = clientKey(req.headers);
  const limited = addr
    ? await limitOr429('password_reset', addr)
    : await limitOr429('password_reset_route', 'forgot');
  if (limited) return limited as NextResponse;

  const parsed = await readJsonBody(req, 4 * 1024);
  if ('response' in parsed) return parsed.response;
  const b = Body.safeParse(parsed.body);
  if (!b.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  // Per-email bucket throttles silently (same 200, nothing sent): a stranger cannot learn anything
  // from it, and a flood from many addresses cannot make the owner's own request visibly fail.
  const limitedAcct = await limitOr429('password_reset_account', emailHash(b.data.email));
  if (!limitedAcct) {
    const email = b.data.email;
    after(() => issueAndSend(email));
  }
  return NextResponse.json({ ok: true });
}

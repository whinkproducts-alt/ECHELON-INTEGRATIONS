export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/api-helpers';
import { z } from 'zod';
import { auth } from '@/auth';
import { readJsonBody } from '@/lib/api-helpers';
import { passkeyCsrf, passkeyLimit, ledgerPasskey, passkeySecurityEvent } from '@/lib/passkeys/guard';
import { ReauthFields, hasOneReauth, verifyReauth } from '@/lib/passkeys/reauth';
import { mintLoginTicket } from '@/lib/passkeys/challenges';
import { bumpSessionVersion } from '@/lib/auth/session-version';

const Body = z.object(ReauthFields).strict().refine(hasOneReauth);

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = passkeyCsrf(req);
  if (csrf) return csrf;
  const u = await requireUserId();
  if ('response' in u) return u.response;
  const limited = await passkeyLimit(req, u.userId);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!id || id.length > 64) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const own = await prisma.passkeyCredential.findFirst({ where: { id, userId: u.userId }, select: { id: true } });
  if (!own) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = await readJsonBody(req, 2 * 1024);
  if ('response' in parsed) return parsed.response;
  const body = Body.safeParse(parsed.body);
  if (!body.success) return NextResponse.json({ error: 'Invalid request: send password or ticket' }, { status: 400 });
  const re = await verifyReauth(u.userId, body.data);
  if (re === 'limited') return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (re === 'denied') return NextResponse.json({ error: 'Re-authentication failed' }, { status: 403 });

  await bumpSessionVersion(u.userId); // before the delete, same reason as register
  const res = await prisma.passkeyCredential.deleteMany({ where: { id, userId: u.userId } });
  if (res.count !== 1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await ledgerPasskey(u.userId, 'passkey_removed', 'EXECUTED', { passkeyId: id });
  await passkeySecurityEvent(u.userId, 'credential_removed', { passkeyId: id, kind: 'passkey' }, 'EXECUTED');
  const remember = ((await auth())?.user as { remember?: boolean } | undefined)?.remember === true;
  const ticket = await mintLoginTicket(u.userId, remember);
  return NextResponse.json({ ok: true, ticket, expiresInSeconds: 60 }, { headers: { 'cache-control': 'no-store' } });
}

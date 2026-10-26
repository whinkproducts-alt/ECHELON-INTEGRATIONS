export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/api-helpers';
import { passkeyCsrf, passkeyLimit, ledgerPasskey } from '@/lib/passkeys/guard';

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = passkeyCsrf(req);
  if (csrf) return csrf;
  const u = await requireUserId();
  if ('response' in u) return u.response;
  const limited = await passkeyLimit(req, u.userId);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!id || id.length > 64) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const res = await prisma.passkeyCredential.deleteMany({ where: { id, userId: u.userId } });
  if (res.count !== 1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await ledgerPasskey(u.userId, 'passkey_deleted', 'EXECUTED', { passkeyId: id });
  return NextResponse.json({ ok: true });
}

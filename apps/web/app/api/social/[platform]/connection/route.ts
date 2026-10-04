export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isSocialPlatform } from '@/lib/social/platforms';
import { disconnect } from '@/lib/social/connections';

/** Delete the caller's own connection. Scoped by session user: another user's row can never match. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { platform } = await params;
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });
  await disconnect(session.user.id, platform);
  return NextResponse.json({ ok: true });
}

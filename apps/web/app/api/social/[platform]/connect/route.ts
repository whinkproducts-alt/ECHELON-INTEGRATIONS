export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isSocialPlatform } from '@/lib/social/platforms';
import { startConnect } from '@/lib/social/oauth';
import { EncryptionNotConfiguredError } from '@/lib/key-encryption';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { platform } = await params;
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });

  let res;
  try {
    res = await startConnect(session.user.id, platform);
  } catch (e) {
    if (e instanceof EncryptionNotConfiguredError) {
      return NextResponse.json({ error: 'encryption_not_configured' }, { status: 503 });
    }
    throw e;
  }
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ authorizeUrl: res.authorizeUrl });
}

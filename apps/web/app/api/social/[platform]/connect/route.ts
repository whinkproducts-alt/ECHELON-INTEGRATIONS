export const dynamic = 'force-dynamic';
import { isLocalOnlyMode, LOCAL_ONLY_UNAVAILABLE } from '@/lib/local-only';
import { ledgerLocalOnlyBlock } from '@/lib/local-only-guard';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isSocialPlatform } from '@/lib/social/platforms';
import { startConnect } from '@/lib/social/oauth';
import { EncryptionNotConfiguredError } from '@/lib/key-encryption';

export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { platform } = await params;
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });
  if (isLocalOnlyMode()) {
    await ledgerLocalOnlyBlock(session.user.id, `social_connect_${platform}`, 'social OAuth needs the platform network');
    return NextResponse.json({ error: LOCAL_ONLY_UNAVAILABLE }, { status: 503 });
  }

  const body = await req.json().catch(() => null) as { consent?: unknown; consentTextVersion?: unknown } | null;
  const consent = body?.consent === true && body.consentTextVersion === 'v1'
    ? { granted: true, textVersion: 'v1' }
    : undefined;
  let res;
  try {
    res = await startConnect(session.user.id, platform, consent);
  } catch (e) {
    if (e instanceof EncryptionNotConfiguredError) {
      return NextResponse.json({ error: 'encryption_not_configured' }, { status: 503 });
    }
    throw e;
  }
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ authorizeUrl: res.authorizeUrl });
}

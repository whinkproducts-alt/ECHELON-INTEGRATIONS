export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isSocialPlatform } from '@/lib/social/platforms';
import { startConnect } from '@/lib/social/oauth';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { platform } = await params;
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });

  const res = await startConnect(session.user.id, platform);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ authorizeUrl: res.authorizeUrl });
}

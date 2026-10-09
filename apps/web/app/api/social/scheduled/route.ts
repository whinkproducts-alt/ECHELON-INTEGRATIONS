export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listScheduledPosts } from '@/lib/social/scheduler';

/** The caller's own pending scheduled posts. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scheduled = await listScheduledPosts(session.user.id);
  return NextResponse.json({ scheduled });
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listConnections } from '@/lib/social/connections';

/** The caller's own connection status for each social platform. Never returns tokens. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const connections = await listConnections(session.user.id);
  return NextResponse.json({ connections });
}

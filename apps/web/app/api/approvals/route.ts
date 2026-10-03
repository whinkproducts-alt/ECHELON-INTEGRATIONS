export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listPending } from '@/lib/approvals';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = new URL(req.url).searchParams.get('status') ?? 'pending';
  if (status !== 'pending') return NextResponse.json({ error: 'Unsupported status filter' }, { status: 400 });

  const approvals = await listPending(session.user.id);
  return NextResponse.json({ approvals });
}

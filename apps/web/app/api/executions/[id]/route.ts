export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { cancelExecution } from '@/lib/worker/ear-execution';
import { limitOr429 } from '@/lib/rate-limit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const execution = await prisma.agentExecution.findFirst({ where: { id, userId: session.user.id } });
  if (!execution) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ execution });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await limitOr429('approvals', session.user.id);
  if (limited) return limited as NextResponse;
  if ((req.headers.get('content-type') ?? '').split(';')[0] !== 'application/json') return NextResponse.json({ error: 'JSON required' }, { status: 415 });
  const body = await req.json().catch(() => null);
  if (!body || body.action !== 'cancel' || Object.keys(body).length !== 1) return NextResponse.json({ error: 'Expected {action: cancel}' }, { status: 400 });
  const { id } = await params;
  const changed = await cancelExecution(session.user.id, id);
  return NextResponse.json({ cancelled: changed });
}

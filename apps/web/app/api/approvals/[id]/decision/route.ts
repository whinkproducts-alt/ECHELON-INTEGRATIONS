export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { decide } from '@/lib/approvals';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Strict: exactly { decision: 'approve' | 'deny' }. Tool and params are never read from the request.
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const keys = Object.keys(body);
  const decision = (body as { decision?: unknown }).decision;
  if (keys.length !== 1 || keys[0] !== 'decision' || (decision !== 'approve' && decision !== 'deny')) {
    return NextResponse.json({ error: "Body must be {decision: 'approve' | 'deny'}" }, { status: 400 });
  }
  if (!id || id.length > 100) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const outcome = await decide(session.user.id, id, decision);
  if (outcome.status === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ id: outcome.id, status: outcome.status, result: outcome.result });
}

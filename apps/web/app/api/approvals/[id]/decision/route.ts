export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { decide } from '@/lib/approvals';
import { limitOr429 } from '@/lib/rate-limit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await limitOr429('approvals', session.user.id);
  if (limited) return limited as NextResponse;
  const { id } = await params;

  // JSON only: text/plain and form bodies are the classic cross-site POST vehicles.
  const contentType = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Strict: { decision }, or { decision, via: 'voice', code }. Tool and params are never read from the request.
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const keys = Object.keys(body);
  const { decision, via, code } = body as { decision?: unknown; via?: unknown; code?: unknown };
  const voice = via === 'voice';
  const shapeOk = keys.every((k) => k === 'decision' || (voice && (k === 'via' || k === 'code'))) && (via === undefined || voice);
  if (!shapeOk || (decision !== 'approve' && decision !== 'deny')) {
    return NextResponse.json({ error: "Body must be {decision: 'approve' | 'deny'} or {decision, via: 'voice', code}" }, { status: 400 });
  }
  if (!id || id.length > 100) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // A spoken approval must repeat the server's confirmation code. A spoken deny needs none.
  const outcome = voice && decision === 'approve'
    ? await decide(session.user.id, id, decision, { voice: { code } })
    : await decide(session.user.id, id, decision);
  if (outcome.status === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (outcome.status === 'CODE_REJECTED') return NextResponse.json({ error: 'Confirmation code required', status: 'CODE_REJECTED' }, { status: 403 });
  return NextResponse.json({ id: outcome.id, status: outcome.status, result: outcome.result });
}

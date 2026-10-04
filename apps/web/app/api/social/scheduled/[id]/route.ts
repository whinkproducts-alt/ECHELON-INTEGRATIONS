export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { cancelScheduledPost, editScheduledPost } from '@/lib/social/scheduler';

/** Cancel one of the caller's scheduled posts. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!id || id.length > 100) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const ok = await cancelScheduledPost(session.user.id, id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/**
 * Edit = cancel the old scheduled post and raise a NEW approval for the new content.
 * Body: { text?: string, send_at?: string }. The old approval never covers the new content.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!id || id.length > 100) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const contentType = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { text, send_at } = body as { text?: unknown; send_at?: unknown };
  const res = await editScheduledPost(session.user.id, id, { text, send_at });
  if (!res.ok) return NextResponse.json({ error: res.error, ...(res.cancelled ? { cancelled: true } : {}) }, { status: res.status });
  return NextResponse.json({ cancelled: true, approval: res.approval });
}

export const dynamic = 'force-dynamic';
// R04: POST activates a saved profile (one active per account); DELETE removes it. Another account's id is 404.
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { activateProfile, deleteProfile } from '@/lib/model-router/priority';
import { limitOr429 } from '@/lib/rate-limit';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('model_profiles', a.userId);
  if (limited) return limited;
  const { id } = await ctx.params;
  const res = await activateProfile(a.userId, id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ profile: res.profile });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await ctx.params;
  if (!(await deleteProfile(a.userId, id))) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

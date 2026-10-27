export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { MinutesInputSchema, MINUTES_MAX, saveMinutes } from '@/lib/board-meetings';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await params;
  if (!id || id.length > 100) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const b = await readJsonBody(req, MINUTES_MAX + 1024);
  if ('response' in b) return b.response;
  const parsed = MinutesInputSchema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid minutes' }, { status: 400 });
  const res = await saveMinutes(a.userId, id, parsed.data.minutes);
  if (res === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ meeting: res.value });
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { installConnector, uninstallConnector } from '@/lib/connectors/registry';

type Ctx = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[a-z0-9_]{1,40}$/.test(id);

export async function POST(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const res = await installConnector(a.userId, id);
  if (res === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (res === 'unavailable') return NextResponse.json({ error: 'No adapter exists for this connector yet' }, { status: 409 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const res = await uninstallConnector(a.userId, id);
  if (res === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}

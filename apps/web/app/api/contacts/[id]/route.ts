export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { ContactPatchSchema, deleteContact, updateContact } from '@/lib/contacts/service';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await params;
  const b = await readJsonBody(req, 16 * 1024);
  if ('response' in b) return b.response;
  const parsed = ContactPatchSchema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid contact', issues: parsed.error.flatten() }, { status: 400 });
  const res = await updateContact(a.userId, id, parsed.data);
  if (res === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ contact: res.value });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await params;
  const res = await deleteContact(a.userId, id);
  if (res === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}

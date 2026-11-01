export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { ContactInputSchema, createContact, listContacts } from '@/lib/contacts/service';

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  return NextResponse.json({ contacts: await listContacts(a.userId) });
}

export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const b = await readJsonBody(req, 16 * 1024);
  if ('response' in b) return b.response;
  const parsed = ContactInputSchema.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid contact', issues: parsed.error.flatten() }, { status: 400 });
  const res = await createContact(a.userId, parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ contact: res.value }, { status: 201 });
}

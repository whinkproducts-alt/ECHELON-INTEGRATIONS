export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { importVCard } from '@/lib/contacts/service';
import { VCardError, VCARD_MAX_BYTES } from '@/lib/contacts/vcard';

/** multipart/form-data with a "file" field (.vcf), or a raw text/vcard body. */
export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('import', a.userId);
  if (limited) return limited as NextResponse;

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > VCARD_MAX_BYTES + 4096) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }
  const ct = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  let bytes: Uint8Array;
  try {
    if (ct === 'multipart/form-data') {
      const file = (await req.formData()).get('file');
      if (!file || typeof file === 'string') return NextResponse.json({ error: 'Missing file' }, { status: 400 });
      if (file.size > VCARD_MAX_BYTES) return NextResponse.json({ error: 'File too large' }, { status: 413 });
      bytes = new Uint8Array(await file.arrayBuffer());
    } else if (ct === 'text/vcard' || ct === 'text/x-vcard') {
      bytes = new Uint8Array(await req.arrayBuffer());
    } else {
      return NextResponse.json({ error: 'Send a .vcf file as multipart/form-data or text/vcard' }, { status: 415 });
    }
    const res = await importVCard(a.userId, bytes);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res.value);
  } catch (e) {
    if (e instanceof VCardError) return NextResponse.json({ error: e.message }, { status: e.message === 'File too large' ? 413 : 422 });
    return NextResponse.json({ error: 'Import failed' }, { status: 400 });
  }
}

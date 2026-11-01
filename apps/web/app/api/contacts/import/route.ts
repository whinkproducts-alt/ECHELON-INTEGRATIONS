export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { BodyTooLargeError, readBodyCapped, requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { importVCard } from '@/lib/contacts/service';
import { VCardError, VCARD_MAX_BYTES } from '@/lib/contacts/vcard';

/** multipart/form-data with a "file" field (.vcf), or a raw text/vcard body. */
export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('import', a.userId);
  if (limited) return limited as NextResponse;

  const ct = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  let bytes: Uint8Array;
  try {
    if (ct !== 'multipart/form-data' && ct !== 'text/vcard' && ct !== 'text/x-vcard') {
      return NextResponse.json({ error: 'Send a .vcf file as multipart/form-data or text/vcard' }, { status: 415 });
    }
    // Running byte cap while streaming (multipart overhead allowed), before any parsing.
    const raw = await readBodyCapped(req, VCARD_MAX_BYTES + 4096);
    if (ct === 'multipart/form-data') {
      const form = await new Response(raw as BodyInit, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return NextResponse.json({ error: 'Missing file' }, { status: 400 });
      if (file.size > VCARD_MAX_BYTES) return NextResponse.json({ error: 'File too large' }, { status: 413 });
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      bytes = raw;
    }
    const res = await importVCard(a.userId, bytes);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res.value);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ error: 'File too large' }, { status: 413 });
    if (e instanceof VCardError) return NextResponse.json({ error: e.message }, { status: e.message === 'File too large' ? 413 : 422 });
    return NextResponse.json({ error: 'Import failed' }, { status: 400 });
  }
}

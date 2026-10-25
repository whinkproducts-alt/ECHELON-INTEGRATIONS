import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isOwnerEmail } from '@/lib/owner';

/** Session user id or a 401 response. */
export async function requireUserId(): Promise<{ userId: string } | { response: NextResponse }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { userId };
}

export class BodyTooLargeError extends Error {}

/**
 * Read a request body with a running byte cap. Stops reading and cancels the stream as soon
 * as the cap is exceeded, so an oversized or endless body is never buffered whole.
 * Content-Length is only a fast-path hint, never trusted.
 */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

/** Session user id plus whether the account is an operator/owner (WHINK_OWNER_EMAILS). */
export async function requireUserWithOwner(): Promise<{ userId: string; owner: boolean } | { response: NextResponse }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { userId, owner: isOwnerEmail(session?.user?.email) };
}

/** Parse a JSON body with a content-type check and a streaming size cap. */
export async function readJsonBody(req: Request, maxBytes = 64 * 1024): Promise<{ body: unknown } | { response: NextResponse }> {
  const ct = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (ct !== 'application/json') {
    return { response: NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 }) };
  }
  try {
    const bytes = await readBodyCapped(req, maxBytes);
    return { body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch (e) {
    if (e instanceof BodyTooLargeError) return { response: NextResponse.json({ error: 'Body too large' }, { status: 413 }) };
    return { response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) };
  }
}

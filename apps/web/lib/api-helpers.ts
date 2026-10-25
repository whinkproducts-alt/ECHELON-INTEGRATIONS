import { NextResponse } from 'next/server';
import { auth } from '@/auth';

/** Session user id or a 401 response. */
export async function requireUserId(): Promise<{ userId: string } | { response: NextResponse }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { userId };
}

/** Parse a JSON body with a content-type and size guard. Returns {error} instead of throwing. */
export async function readJsonBody(req: Request, maxBytes = 64 * 1024): Promise<{ body: unknown } | { response: NextResponse }> {
  const ct = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (ct !== 'application/json') {
    return { response: NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 }) };
  }
  const len = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(len) && len > maxBytes) {
    return { response: NextResponse.json({ error: 'Body too large' }, { status: 413 }) };
  }
  try {
    const text = await req.text();
    if (text.length > maxBytes) return { response: NextResponse.json({ error: 'Body too large' }, { status: 413 }) };
    return { body: JSON.parse(text) };
  } catch {
    return { response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) };
  }
}

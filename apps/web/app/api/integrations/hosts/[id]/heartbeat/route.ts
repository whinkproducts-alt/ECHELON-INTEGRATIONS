export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readJsonBody } from '@/lib/api-helpers';
import { clientKey, limitOr429 } from '@/lib/rate-limit';
import { recordHeartbeat } from '@/lib/capability/hosts';
import { CapabilityInputError } from '@/lib/capability/providers';

/**
 * Host heartbeat. Authenticated by the host's own token (Authorization: Bearer eh_...), not by a
 * browser session; proxy.ts lets exactly this path through. The CSRF rule still applies, so the host
 * agent sends an Origin header equal to the app origin (scripts/host-heartbeat.mjs does).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = /^Bearer (eh_[A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('authorization') ?? '');
  // Failures are counted, successes are not: a valid host can never be starved by someone else's bad requests.
  // Per client address when a trusted proxy gives one, else a looser shared bucket.
  const addr = clientKey(req.headers);
  const failed = async (): Promise<Response> =>
    (addr ? await limitOr429('heartbeat', addr) : await limitOr429('heartbeat_route', 'heartbeat'))
    ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); // one answer for "no such host" and "wrong token"
  if (!m) return failed();
  const parsed = await readJsonBody(req, 8 * 1024);
  // A body that cannot be read is an error, never an empty heartbeat: the host's stored details are left alone.
  if ('response' in parsed) return parsed.response;
  const body = parsed.body && typeof parsed.body === 'object' && !Array.isArray(parsed.body) ? (parsed.body as { capabilities?: unknown; metadata?: unknown }) : {};
  try {
    const out = await recordHeartbeat(id, m[1], body);
    if (!out.ok) return failed();
    return NextResponse.json({ ok: true, status: out.status, receivedAt: out.receivedAt });
  } catch (e) {
    if (e instanceof CapabilityInputError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }
}

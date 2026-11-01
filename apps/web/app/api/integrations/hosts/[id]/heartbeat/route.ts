export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readJsonBody } from '@/lib/api-helpers';
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
  const parsed = await readJsonBody(req, 8 * 1024);
  const body = 'body' in parsed && parsed.body && typeof parsed.body === 'object' ? (parsed.body as { capabilities?: unknown; metadata?: unknown }) : {};
  try {
    const out = m ? await recordHeartbeat(id, m[1], body) : { ok: false as const };
    // One answer for "no such host" and "wrong token".
    if (!out.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ ok: true, status: out.status, receivedAt: out.receivedAt });
  } catch (e) {
    if (e instanceof CapabilityInputError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }
}

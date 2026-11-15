export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { isLocalOnlyMode } from '@/lib/local-only';
import { OMNIROUTE_PREFIX, omniRouteBaseUrl, omniRouteConfigured } from '@/lib/model-router/omniroute';

interface Listing { configured: boolean; reachable: boolean; models: string[]; reason?: string }

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,99}$/;
let cache: { at: number; body: Listing } | null = null;

/** The models OmniRoute offers, for the chat picker. The key is used here and never returned. */
export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  if (isLocalOnlyMode()) return NextResponse.json<Listing>({ configured: false, reachable: false, models: [], reason: 'Local-Only mode refuses OmniRoute.' });
  if (!omniRouteConfigured()) return NextResponse.json<Listing>({ configured: false, reachable: false, models: [], reason: 'Set OMNIROUTE_API_KEY to enable OmniRoute.' });
  if (cache && Date.now() - cache.at < 60_000) return NextResponse.json(cache.body);

  let body: Listing;
  try {
    const res = await fetch(`${omniRouteBaseUrl()}/models`, {
      headers: { Authorization: `Bearer ${process.env.OMNIROUTE_API_KEY!.trim()}` },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { data?: Array<{ id?: unknown }> };
    const models = (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string' && MODEL_ID.test(id)).slice(0, 200).map((id) => `${OMNIROUTE_PREFIX}${id}`);
    body = { configured: true, reachable: true, models };
  } catch {
    body = { configured: true, reachable: false, models: [], reason: 'OmniRoute is unreachable or refused the key.' };
  }
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}

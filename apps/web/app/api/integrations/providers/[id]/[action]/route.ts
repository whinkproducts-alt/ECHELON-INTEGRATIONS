export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readJsonBody } from '@/lib/api-helpers';
import { requireOwner, errorResponse } from '@/lib/capability/api';
import {
  automatedChecks, disableProvider, discoverProvider, enableProvider, publicProvider, reviewProvider, revokeProvider,
  CapabilityInputError, type ReviewInput,
} from '@/lib/capability/providers';

type Ctx = { params: Promise<{ id: string; action: string }> };

/** GET .../checks: the automated checks and the plain-language summary the Founder is asked to review. */
export async function GET(_req: Request, { params }: Ctx) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const { id, action } = await params;
  try {
    if (action !== 'checks') throw new CapabilityInputError('unknown action', 404);
    return NextResponse.json(await automatedChecks(who.userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST .../(discover|review|enable|disable|revoke). One endpoint per state change, all owner-only. */
export async function POST(req: Request, { params }: Ctx) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const { id, action } = await params;
  try {
    switch (action) {
      case 'discover': return NextResponse.json(await discoverProvider(who.userId, id));
      case 'review': {
        const body = await readJsonBody(req);
        if ('response' in body) return body.response;
        return NextResponse.json({ provider: publicProvider(await reviewProvider(who.userId, id, body.body as ReviewInput)) });
      }
      case 'enable': return NextResponse.json({ provider: publicProvider(await enableProvider(who.userId, id)) });
      case 'disable': return NextResponse.json({ provider: publicProvider(await disableProvider(who.userId, id)) });
      case 'revoke': return NextResponse.json({ provider: publicProvider(await revokeProvider(who.userId, id)) });
      default: throw new CapabilityInputError('unknown action', 404);
    }
  } catch (e) {
    return errorResponse(e);
  }
}

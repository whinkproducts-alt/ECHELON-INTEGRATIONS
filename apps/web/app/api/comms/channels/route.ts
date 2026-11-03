export const dynamic = 'force-dynamic';
// R06: which delivery channels have credentials configured on this server (presence only, never values) and
// whether lockdown or Local-Only would stop them. Owner only: it describes the operator's configuration.
import { NextResponse } from 'next/server';
import { requireUserWithOwner } from '@/lib/api-helpers';
import { channelConfiguration } from '@/lib/comms/delivery';
import { isLocalOnlyMode } from '@/lib/local-only';
import { getSafetyState } from '@/lib/safety/lockdown';

export async function GET() {
  const who = await requireUserWithOwner();
  if ('response' in who) return who.response;
  if (!who.owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const safety = await getSafetyState(who.userId);
  return NextResponse.json({
    channels: channelConfiguration(),
    blockedBy: safety.lockedDown ? 'lockdown' : isLocalOnlyMode() ? 'local_only' : null,
    note: 'Configured means credentials are present. A channel is verified only after an approved live test.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}

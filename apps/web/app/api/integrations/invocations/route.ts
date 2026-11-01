export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOwner } from '@/lib/capability/api';
import { EVENT_ACTION_PREFIXES } from '@/lib/capability/events';

/** Receipts. Arguments and results are never stored, so none can be returned: keys, size and sha256 only. */
export async function GET(req: Request) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get('limit') ?? 50) || 50, 1), 200);
  const rows = await prisma.action.findMany({
    where: { userId: who.userId, OR: EVENT_ACTION_PREFIXES.map((p) => ({ action: { startsWith: p } })) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { id: true, action: true, status: true, errorCode: true, createdAt: true, latencyMs: true, tool: true, permissionClass: true, confirmationMethod: true, inputSummary: true, outputSummary: true, correlationId: true, capabilityId: true, connectorInstallId: true, hostId: true, approvalId: true, grantId: true, initiator: true },
  });
  return NextResponse.json({ invocations: rows });
}

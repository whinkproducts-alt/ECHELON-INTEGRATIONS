export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readJsonBody } from '@/lib/api-helpers';
import { requireOwner, errorResponse } from '@/lib/capability/api';
import { publicProvider, registerProvider, type RegisterInput } from '@/lib/capability/providers';

export async function GET() {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const rows = await prisma.connectorInstall.findMany({
    where: { userId: who.userId, kind: 'MCP_SERVER' },
    orderBy: { installedAt: 'desc' },
    include: { tools: { select: { id: true, name: true, originalName: true, riskClass: true, costClass: true, isActive: true, defHash: true, reviewedDefHash: true } } },
  });
  return NextResponse.json({ providers: rows.map(publicProvider) });
}

export async function POST(req: Request) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const parsed = await readJsonBody(req);
  if ('response' in parsed) return parsed.response;
  try {
    const row = await registerProvider(who.userId, parsed.body as RegisterInput);
    return NextResponse.json({ provider: publicProvider(row) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readJsonBody } from '@/lib/api-helpers';
import { requireOwner, errorResponse } from '@/lib/capability/api';
import { createGrant, type GrantInput } from '@/lib/capability/providers';

export async function GET() {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const grants = await prisma.capabilityGrant.findMany({
    where: { userId: who.userId }, orderBy: { createdAt: 'desc' }, take: 200,
    include: { tool: { select: { name: true, originalName: true } } },
  });
  return NextResponse.json({ grants });
}

export async function POST(req: Request) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const parsed = await readJsonBody(req);
  if ('response' in parsed) return parsed.response;
  try {
    return NextResponse.json({ grant: await createGrant(who.userId, parsed.body as GrantInput) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

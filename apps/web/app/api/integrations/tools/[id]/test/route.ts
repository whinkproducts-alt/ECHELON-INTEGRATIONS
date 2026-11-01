export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readJsonBody } from '@/lib/api-helpers';
import { requireOwner, errorResponse } from '@/lib/capability/api';
import { invokeCapability } from '@/lib/capability/invoke';
import { isDataClass } from '@/lib/capability/policy';
import { CapabilityInputError } from '@/lib/capability/providers';

/**
 * Founder test of one tool. Same gates, same permission engine, same ledger as an agent call; the
 * only difference is that no grant is needed. A Class B / C or protected tool does not run: it
 * creates an approval request, exactly as for an agent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const parsed = await readJsonBody(req);
  if ('response' in parsed) return parsed.response;
  try {
    const { id } = await params;
    const body = (parsed.body ?? {}) as { args?: unknown; dataClass?: unknown };
    const tool = await prisma.tool.findFirst({ where: { id, connectorInstall: { userId: who.userId, kind: 'MCP_SERVER' } }, select: { name: true } });
    if (!tool) throw new CapabilityInputError('tool not found', 404);
    if (!isDataClass(body.dataClass)) throw new CapabilityInputError('dataClass is required (public | organization | confidential)');
    if (!body.args || typeof body.args !== 'object' || Array.isArray(body.args)) throw new CapabilityInputError('args must be an object');
    const res = await invokeCapability({
      userId: who.userId, subject: { type: 'OWNER' }, toolName: tool.name, args: body.args as Record<string, unknown>, dataClass: body.dataClass,
    });
    return NextResponse.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { executeTool } from '@/lib/tool-registry';
import { normaliseMambaMode } from '@/lib/types';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  // L1: Read persona from server-side DB state — never trust client-supplied persona/mambaMode
  const personaState = await prisma.personaState.findUnique({ where: { userId: session.user.id } });
  const persona = personaState?.activePersona ?? 'WHINK';
  const mambaMode = normaliseMambaMode(personaState?.mambaMode, persona) ?? undefined;

  const result = await executeTool(
    session.user.id,
    body.tool,
    body.params ?? {},
    persona,
    mambaMode
  );
  return NextResponse.json(result);
}

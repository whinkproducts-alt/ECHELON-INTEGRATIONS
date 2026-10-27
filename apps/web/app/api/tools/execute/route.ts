export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { executeTool } from '@/lib/tool-registry';
import { normaliseMambaMode } from '@/lib/types';
import { limitOr429 } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await limitOr429('tools_execute', session.user.id);
  if (limited) return limited as NextResponse;
  let body: { tool?: unknown; params?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Basic shape validation — tool name must be a non-empty string.
  if (typeof body.tool !== 'string' || body.tool.trim().length === 0) {
    return NextResponse.json({ error: 'tool must be a non-empty string' }, { status: 400 });
  }

  // L1: Read persona from server-side DB state — never trust client-supplied persona/mambaMode
  const personaState = await prisma.personaState.findUnique({ where: { userId: session.user.id } });
  const persona = personaState?.activePersona ?? 'WHINK';
  const mambaMode = normaliseMambaMode(personaState?.mambaMode, persona) ?? undefined;

  const result = await executeTool(
    session.user.id,
    body.tool,
    body.params ?? {},
    persona,
    mambaMode,
    undefined,
    { initiator: 'user' }
  );
  return NextResponse.json(result);
}

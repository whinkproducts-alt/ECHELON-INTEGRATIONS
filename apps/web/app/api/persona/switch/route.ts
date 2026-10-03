export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { normaliseMambaMode } from '@/lib/types';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { persona } = body;
  if (!persona || !['WHINK', 'MAMBA'].includes(persona)) {
    return NextResponse.json({ error: 'Invalid persona' }, { status: 400 });
  }
  const state = await prisma.personaState.upsert({
    where: { userId: session.user.id },
    update: {
      activePersona: persona,
      mambaMode: normaliseMambaMode(body.mambaMode, persona),
      activationSource: 'user',
      activatedAt: new Date(),
    },
    create: {
      userId: session.user.id,
      activePersona: persona,
      mambaMode: normaliseMambaMode(body.mambaMode, persona),
      activationSource: 'user',
    },
  });
  return NextResponse.json(state);
}

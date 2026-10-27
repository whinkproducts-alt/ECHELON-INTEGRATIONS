export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { normaliseMambaMode } from '@/lib/types';
import { recordActionSafe } from '@/lib/ledger';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { persona, mambaMode: rawMambaMode } = body;
  if (!persona || !['WHINK', 'MAMBA', 'PETER', 'PAUL', 'MICAH', 'NANDI', 'SCOUT'].includes(persona)) {
    return NextResponse.json({ error: 'Invalid persona' }, { status: 400 });
  }
  // A3: MAMBA is Obsidian only. Reject any explicit mambaMode other than OBSIDIAN or null/undefined.
  if (rawMambaMode !== undefined && rawMambaMode !== null && rawMambaMode !== 'OBSIDIAN') {
    return NextResponse.json(
      { error: 'Invalid mambaMode: only OBSIDIAN is permitted' },
      { status: 400 }
    );
  }
  const resolvedMambaMode = normaliseMambaMode(body.mambaMode, persona);
  const state = await prisma.personaState.upsert({
    where: { userId: session.user.id },
    update: {
      activePersona: persona,
      mambaMode: resolvedMambaMode,
      activationSource: 'user',
      activatedAt: new Date(),
    },
    create: {
      userId: session.user.id,
      activePersona: persona,
      mambaMode: resolvedMambaMode,
      activationSource: 'user',
    },
  });
  await recordActionSafe({
    userId: session.user.id,
    action: 'persona_switch',
    persona,
    mambaMode: resolvedMambaMode ?? undefined,
    status: 'SUBMITTED',
    permissionClass: 'A',
    initiator: 'user',
  });
  return NextResponse.json(state);
}

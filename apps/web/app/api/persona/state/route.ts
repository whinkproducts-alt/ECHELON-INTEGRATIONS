export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { normaliseMambaMode } from '@/lib/types';
import { isOwnerEmail } from '@/lib/owner';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isFounder = isOwnerEmail(session.user.email);
  const state = await prisma.personaState.findUnique({ where: { userId: session.user.id } });
  if (state) {
    const safeState = !isFounder && state.activePersona === 'REGISTRATION'
      ? { ...state, activePersona: 'WHINK', mambaMode: null }
      : { ...state, mambaMode: normaliseMambaMode(state.mambaMode, state.activePersona) };
    return NextResponse.json({ ...safeState, isFounder });
  }
  return NextResponse.json({ activePersona: 'WHINK', mambaMode: null, functionalMode: null, isFounder });
}

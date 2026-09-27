export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const state = await prisma.personaState.findUnique({ where: { userId: session.user.id } });
  return NextResponse.json(state ?? { activePersona: 'WHINK', mambaMode: null, functionalMode: null });
}

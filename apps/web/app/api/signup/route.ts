export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  // SIGNUP_ENABLED=false closes registration (single-owner instance). The ledger needs a real
  // user id and there is none here, so the blocked attempt is a security log event instead.
  if ((process.env.SIGNUP_ENABLED ?? 'true').trim().toLowerCase() === 'false') {
    logger.security('signup blocked: SIGNUP_ENABLED=false', { path: '/api/signup' });
    return NextResponse.json({ error: 'Signups are closed on this instance.' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { email, password, name } = body ?? {};

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Account already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        name: name ?? null,
        passwordHash,
        role: 'user',
      },
    });

    // Create default profile and preferences
    await prisma.userProfile.create({
      data: { userId: user.id },
    });
    await prisma.userPreference.create({
      data: { userId: user.id },
    });
    // Create default persona state
    await prisma.personaState.create({
      data: { userId: user.id, activePersona: 'WHINK' },
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 });
  }
}

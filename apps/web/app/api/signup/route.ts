export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
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

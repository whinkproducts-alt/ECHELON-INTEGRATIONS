export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

const CLOSED = 'Signups are closed on this instance.';
// Arbitrary constant: serialises first-user bootstrap and signups across processes.
const SIGNUP_LOCK = 724_001;

class SignupError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Open when SIGNUP_ENABLED is exactly 'true', or when the users table is empty (first-user
 * bootstrap, decided inside the same transaction as the insert). SIGNUP_ENABLED=false closes
 * it outright, even when empty. Anything else (unset, empty, other text) is closed once a user exists.
 */
export async function POST(req: NextRequest) {
  const flag = (process.env.SIGNUP_ENABLED ?? '').trim();
  if (flag.toLowerCase() === 'false') {
    logger.security('signup blocked: SIGNUP_ENABLED=false', { path: '/api/signup' });
    return NextResponse.json({ error: CLOSED }, { status: 403 });
  }
  const open = flag === 'true';
  try {
    const body = await req.json();
    const { email: rawEmail, password, name } = body ?? {};

    if (typeof rawEmail !== 'string' || typeof password !== 'string' || !rawEmail.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    const email = rawEmail.trim().toLowerCase();
    if (email.length > 254) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SIGNUP_LOCK})`;
      if (!open && (await tx.user.count()) > 0) throw new SignupError(403, CLOSED);
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) throw new SignupError(409, 'Account already exists');
      const created = await tx.user.create({
        data: { email, name: typeof name === 'string' ? name : null, passwordHash, role: 'user' },
      });
      await tx.userProfile.create({ data: { userId: created.id } });
      await tx.userPreference.create({ data: { userId: created.id } });
      await tx.personaState.create({ data: { userId: created.id, activePersona: 'WHINK' } });
      return created;
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (error: any) {
    if (error instanceof SignupError) {
      if (error.status === 403) logger.security('signup blocked: users exist and SIGNUP_ENABLED is not true', { path: '/api/signup' });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error?.code === 'P2002') return NextResponse.json({ error: 'Account already exists' }, { status: 409 });
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 });
  }
}

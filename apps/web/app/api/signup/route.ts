export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';
import { timingSafeEqual } from 'crypto';
import { clientKey, limitOr429 } from '@/lib/rate-limit';

const CLOSED = 'Signups are closed on this instance.';
// Arbitrary constant: serialises first-user bootstrap and signups across processes.
const SIGNUP_LOCK = 724_001;

let warnedNoToken = false;

function tokenMatches(given: unknown): boolean {
  const want = Buffer.from(process.env.SIGNUP_BOOTSTRAP_TOKEN ?? '');
  const got = Buffer.from(typeof given === 'string' ? given : '');
  return want.length > 0 && got.length === want.length && timingSafeEqual(got, want);
}

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
    const { email: rawEmail, password, name, bootstrapToken } = body ?? {};

    if (typeof rawEmail !== 'string' || typeof password !== 'string' || !rawEmail.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    const email = rawEmail.trim().toLowerCase();
    if (email.length > 254) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SIGNUP_LOCK})`;
      const total = await tx.user.count();
      if (!open && total > 0) throw new SignupError(403, CLOSED);
      if (total === 0) {
        // First account: when SIGNUP_BOOTSTRAP_TOKEN is set it must be presented.
        if ((process.env.SIGNUP_BOOTSTRAP_TOKEN ?? '') !== '') {
          const limited = await limitOr429('signup_bootstrap', clientKey(req.headers) ?? 'route');
          if (limited) throw new SignupError(429, 'Too many requests');
          if (!tokenMatches(bootstrapToken)) {
            logger.security('signup blocked: bootstrap token missing or wrong', { path: '/api/signup' });
            throw new SignupError(403, CLOSED);
          }
        } else if (!warnedNoToken) {
          warnedNoToken = true;
          logger.warn('first signup is open to anyone who can reach this instance: set SIGNUP_BOOTSTRAP_TOKEN', { path: '/api/signup' });
        }
      }
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

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { clientKey, limitOr429 } from '@/lib/rate-limit';

/** Public and minimal: lets the signup form know whether to show the bootstrap token field. */
export async function GET(req: Request) {
  const limited = await limitOr429('signup_route', clientKey(req.headers) ?? 'status');
  if (limited) return limited;
  const flag = (process.env.SIGNUP_ENABLED ?? '').trim();
  const empty = (await prisma.user.count()) === 0;
  const closed = flag.toLowerCase() === 'false';
  const open = !closed && (flag === 'true' || empty);
  const needsBootstrapToken = !closed && empty && (process.env.SIGNUP_BOOTSTRAP_TOKEN ?? '') !== '';
  return NextResponse.json({ open, needsBootstrapToken }, { headers: { 'cache-control': 'no-store' } });
}

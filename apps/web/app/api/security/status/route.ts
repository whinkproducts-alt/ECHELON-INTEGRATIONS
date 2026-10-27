export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { securityStatus } from '@/lib/security-status';

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  return NextResponse.json(await securityStatus(a.userId));
}

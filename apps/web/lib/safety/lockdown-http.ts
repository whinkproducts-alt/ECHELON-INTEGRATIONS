/** Route helper for R07: a 423 response when the account is locked down, otherwise null. */
import { NextResponse } from 'next/server';
import { isLockedDown, ledgerLockdownBlock, LOCKDOWN_MESSAGE } from '@/lib/safety/lockdown';

export async function lockdownResponse(userId: string, boundary: string): Promise<NextResponse | null> {
  if (!(await isLockedDown(userId))) return null;
  await ledgerLockdownBlock(userId, boundary);
  return NextResponse.json({ error: LOCKDOWN_MESSAGE, code: 'LOCKDOWN_ACTIVE' }, { status: 423 });
}

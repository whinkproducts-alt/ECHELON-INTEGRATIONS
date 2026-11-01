/**
 * Shared route plumbing for /api/integrations/*. Founder (owner) only: the Integration Hub is the
 * Founder's control plane, so a non-owner account gets 403 even with a valid session, and a
 * session-less request never reaches a handler (proxy.ts redirects it).
 */
import { NextResponse } from 'next/server';
import { requireUserWithOwner } from '@/lib/api-helpers';
import { CapabilityInputError } from '@/lib/capability/providers';
import { CapabilityError } from '@/lib/capability/invoke';
import { EncryptionNotConfiguredError } from '@/lib/key-encryption';
import { logger } from '@/lib/logger';

export async function requireOwner(): Promise<{ userId: string } | { response: NextResponse }> {
  const who = await requireUserWithOwner();
  if ('response' in who) return who;
  if (!who.owner) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { userId: who.userId };
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof CapabilityInputError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof CapabilityError) {
    const status = e.code === 'RES_NOT_FOUND' ? 404 : e.code === 'AUTHZ_POLICY_DENIED' || e.code === 'DATA_CLASS_DENIED' || e.code === 'EGRESS_DENIED' || e.code === 'BLOCKED_COST' ? 403 : e.code === 'VAL_INPUT_INVALID' ? 400 : e.code.startsWith('EXEC_') ? 502 : 409;
    return NextResponse.json({ error: e.message, code: e.code, actionId: e.actionId ?? null }, { status });
  }
  if (e instanceof EncryptionNotConfiguredError) return NextResponse.json({ error: 'Encryption is not configured on the server (ENCRYPTION_KEY)' }, { status: 503 });
  logger.error('integrations route failed', { error: (e as Error)?.message });
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { recordActionSafe } from '@/lib/ledger';
import { generateCorrelationId } from '@/lib/logger';

const VALID_PROVIDERS = new Set(['anthropic', 'openai']);

/** DELETE /api/settings/api-keys/[provider] — remove a stored key */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider } = await params;
  if (!VALID_PROVIDERS.has(provider)) return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });

  const { count } = await prisma.userApiKey.deleteMany({
    where: { userId: session.user.id, provider },
  });

  // Provider name and whether a key existed. Never any key material.
  await recordActionSafe({
    userId: session.user.id, initiator: 'user', persona: 'WHINK', action: 'api_key_removed', tool: 'settings',
    permissionClass: 'A', status: 'EXECUTED', correlationId: generateCorrelationId(),
    inputSummary: `provider=${provider} removed=${count}`,
  });

  return NextResponse.json({ deleted: true });
}

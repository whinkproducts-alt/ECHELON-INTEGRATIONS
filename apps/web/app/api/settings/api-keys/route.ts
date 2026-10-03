import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { encryptKey, keyHint } from '@/lib/key-encryption';

const VALID_PROVIDERS = new Set(['anthropic', 'openai']);

/** GET /api/settings/api-keys — list stored key hints (never returns plaintext) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const keys = await prisma.userApiKey.findMany({
    where: { userId: session.user.id },
    select: { provider: true, keyHint: true, createdAt: true },
  });

  return NextResponse.json(keys);
}

/** POST /api/settings/api-keys — upsert a provider key */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const provider = body?.provider as string;
  const plaintextKey = body?.key as string;

  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }
  if (!plaintextKey || plaintextKey.length < 20) {
    return NextResponse.json({ error: 'Key too short' }, { status: 400 });
  }

  // Basic prefix validation
  if (provider === 'anthropic' && !plaintextKey.startsWith('sk-ant-')) {
    return NextResponse.json({ error: 'Anthropic keys must start with sk-ant-' }, { status: 400 });
  }
  if (provider === 'openai' && !plaintextKey.startsWith('sk-')) {
    return NextResponse.json({ error: 'OpenAI keys must start with sk-' }, { status: 400 });
  }

  const encryptedKey = encryptKey(plaintextKey);
  const hint = keyHint(plaintextKey);

  await prisma.userApiKey.upsert({
    where: { userId_provider: { userId: session.user.id, provider } },
    create: { userId: session.user.id, provider, encryptedKey, keyHint: hint },
    update: { encryptedKey, keyHint: hint },
  });

  return NextResponse.json({ provider, keyHint: hint });
}

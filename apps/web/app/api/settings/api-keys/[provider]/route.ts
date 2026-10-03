import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

/** DELETE /api/settings/api-keys/[provider] — remove a stored key */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider } = await params;

  await prisma.userApiKey.deleteMany({
    where: { userId: session.user.id, provider },
  });

  return NextResponse.json({ deleted: true });
}

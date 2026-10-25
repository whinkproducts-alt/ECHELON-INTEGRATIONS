export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { listDocuments } from '@/lib/anythingllm-client';

/**
 * GET /api/documents
 * List documents in the user's AnythingLLM workspace.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const ws = await prisma.documentWorkspace.findUnique({ where: { userId } });
  if (!ws) {
    return NextResponse.json({ documents: [] });
  }

  const documents = await listDocuments(userId, ws.workspaceSlug);
  return NextResponse.json({ documents });
}

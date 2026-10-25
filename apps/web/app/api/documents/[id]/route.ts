export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { deleteDocument } from '@/lib/anythingllm-client';
import { recordActionSafe } from '@/lib/ledger';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const documentId = params.id;
  if (!documentId || typeof documentId !== 'string') {
    return NextResponse.json({ error: 'document id required' }, { status: 400 });
  }

  // Resolve the user's workspace (tenant isolation — only the owning user can delete)
  const ws = await prisma.documentWorkspace.findUnique({ where: { userId } });
  if (!ws) {
    return NextResponse.json(
      { error: 'No document workspace configured for this account.' },
      { status: 404 },
    );
  }

  try {
    await deleteDocument(userId, ws.workspaceSlug, documentId);
  } catch {
    await recordActionSafe({
      userId,
      action: 'document_delete_failed',
      permissionClass: 'A',
      status: 'FAILED',
      tool: 'documents_delete',
      inputSummary: `documentId=${documentId.slice(0, 200)}`,
    });
    return NextResponse.json({ error: 'Delete from document store failed' }, { status: 502 });
  }

  // Ledger: document id only — never content (C6)
  await recordActionSafe({
    userId,
    action: 'document_deleted',
    permissionClass: 'A',
    status: 'SUBMITTED',
    tool: 'documents_delete',
    inputSummary: `documentId=${documentId.slice(0, 200)}`,
  });

  return NextResponse.json({ deleted: true }, { status: 200 });
}

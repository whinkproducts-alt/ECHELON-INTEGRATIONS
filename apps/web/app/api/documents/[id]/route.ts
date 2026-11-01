export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { deleteDocument } from '@/lib/anythingllm-client';
import { recordActionSafe } from '@/lib/ledger';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // H1 fix: Next 16 passes params as a Promise — must await before reading.
  const { id: documentId } = await params;
  if (!documentId || typeof documentId !== 'string') {
    return NextResponse.json({ error: 'document id required' }, { status: 400 });
  }

  // H1 fix: look up the Document record scoped by userId before any action.
  // A document that doesn't belong to the requesting user is indistinguishable from
  // a document that doesn't exist — 404 in both cases to prevent enumeration.
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!doc || doc.userId !== userId) {
    // Log cross-tenant or unknown id access as a security event.
    await recordActionSafe({
      userId,
      action: 'document_delete_unauthorized',
      permissionClass: 'A',
      status: 'DENIED',
      tool: 'documents_delete',
      inputSummary: `documentId=${documentId.slice(0, 200)}`,
    });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Resolve the workspace for the AnythingLLM call — still scoped by userId.
  const ws = await prisma.documentWorkspace.findUnique({ where: { userId } });
  if (!ws) {
    return NextResponse.json(
      { error: 'No document workspace configured for this account.' },
      { status: 404 },
    );
  }

  try {
    await deleteDocument(userId, ws.workspaceSlug, doc.anythingllmDocId);
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

  // Remove the ownership record.
  await prisma.document.delete({ where: { id: documentId } });

  // Ledger: document id only — never content (C6).
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

export const dynamic = 'force-dynamic';

// PIPEDA Q3: users must be able to see every document WHINK holds about them.
// This route returns the Document ownership records (our source of truth) plus
// the live list from AnythingLLM. Our records are the authoritative inventory;
// AnythingLLM entries are supplementary.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { listDocuments } from '@/lib/anythingllm-client';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = req.nextUrl;
  const cursor = searchParams.get('cursor') ?? undefined;
  const rawLimit = parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10);
  const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_PAGE_SIZE : rawLimit, MAX_PAGE_SIZE);

  // Primary inventory: Document ownership records — always scoped to this user.
  const rows = await prisma.document.findMany({
    where: { userId, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { uploadedAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      anythingllmDocId: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      sha256: true,
      uploadedAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Supplementary: live list from AnythingLLM (best-effort — ignored on failure).
  let anythingllmDocs: unknown[] = [];
  try {
    const ws = await prisma.documentWorkspace.findUnique({ where: { userId } });
    if (ws) {
      anythingllmDocs = await listDocuments(userId, ws.workspaceSlug);
    }
  } catch {
    // AnythingLLM is optional; our records are the primary inventory.
  }

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
    anythingllmDocs,
  });
}

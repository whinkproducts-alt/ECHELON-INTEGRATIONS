export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { deleteSubmission } from '@/lib/skills/pipeline';

const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // No raw content is ever selected.
  const row = await prisma.skillSubmission.findFirst({
    where: { id: parsed.data, userId: a.userId },
    select: {
      id: true, name: true, filename: true, sha256: true, sizeBytes: true, status: true, scanReport: true, committee: true,
      decision: true, reason: true, memoryIds: true, attempts: true, createdAt: true, updatedAt: true,
    },
  });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ submission: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = await deleteSubmission(a.userId, parsed.data);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}

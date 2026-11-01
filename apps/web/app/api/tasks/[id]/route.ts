export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { validateTaskInput } from '@/lib/task-input';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const parsed = validateTaskInput(body as Record<string, unknown>, {
    allowAssignee: true,
    allowStatus: true,
    partial: true,
  });
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Single scoped write: the ownership filter is part of the update itself.
  const res = await prisma.projectTask.updateMany({
    where: { id, project: { ownerId: session.user.id } },
    data: parsed.value,
  });
  if (res.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.projectTask.findFirst({
    where: { id, project: { ownerId: session.user.id } },
  });
  return NextResponse.json(updated);
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { assertOwnedProject, hasProjectId } from '@/lib/project-access';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id, isArchived: false },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
  });
  return NextResponse.json(conversations);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  let projectId: string | null = null;
  if (hasProjectId(body?.projectId)) {
    projectId = await assertOwnedProject(session.user.id, body.projectId);
    if (!projectId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  const conversation = await prisma.conversation.create({
    data: {
      userId: session.user.id,
      title: body?.title ?? 'New Conversation',
      projectId,
    },
  });
  return NextResponse.json(conversation);
}

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const [messagesSent, memoryEntries, toolCalls] = await Promise.all([
    prisma.action.count({
      where: { userId, createdAt: { gte: start } },
    }),
    prisma.memorySemantic.count({
      where: { userId, createdAt: { gte: start } },
    }),
    prisma.action.count({
      where: { userId, createdAt: { gte: start }, NOT: { tool: null } },
    }),
  ]);

  return NextResponse.json({ messagesSent, memoryEntries, toolCalls });
}

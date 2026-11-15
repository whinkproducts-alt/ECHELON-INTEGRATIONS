import { NextResponse } from 'next/server';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { prisma } from '@/lib/db';
import { encodeCursor, decodeCursor, type Cursor } from '@/lib/capability/events';

export async function GET(req: Request) {
  const auth = requireMarcusAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const taskId = url.searchParams.get('task_id');
  if (!taskId) return NextResponse.json({ error: 'task_id required' }, { status: 400 });

  const cursorParam = url.searchParams.get('cursor');
  const cursor: Cursor | null = cursorParam ? decodeCursor(cursorParam) : null;

  // Find the task and its user
  const task = await prisma.agentJob.findFirst({
    where: { id: taskId, jobKey: { startsWith: 'marcus:' } },
    select: { userId: true }
  });
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  // Filter events for this task (capabilityId matches task id)
  const kindFilter = [
    { action: { startsWith: 'capability_marcus_' } },
    { action: { startsWith: 'host_' } },
    { action: { startsWith: 'grant_' } },
  ];

  const where: any = {
    userId: task.userId,
    OR: kindFilter,
    capabilityId: taskId,
  };

  if (cursor) {
    where.AND = [
      {
        OR: [
          { createdAt: { gt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } }
        ]
      }
    ];
  }

  const rows = await prisma.action.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 200,
    select: {
      id: true, action: true, status: true, errorCode: true, createdAt: true,
      capabilityId: true, connectorInstallId: true, hostId: true, approvalId: true, grantId: true
    }
  });

  const events = rows.map(r => ({
    id: encodeCursor({ createdAt: r.createdAt.getTime(), id: r.id }),
    type: r.action,
    data: {
      actionId: r.id, status: r.status, errorCode: r.errorCode, at: r.createdAt.toISOString(),
      capabilityId: r.capabilityId, connectorInstallId: r.connectorInstallId,
      hostId: r.hostId, approvalId: r.approvalId, grantId: r.grantId,
    }
  }));

  return NextResponse.json({ events });
}

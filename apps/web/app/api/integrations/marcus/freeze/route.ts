import { NextResponse } from 'next/server';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const auth = requireMarcusAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Find all pending Marcus tasks for Victor
  const tasks = await prisma.agentJob.findMany({
    where: {
      userId: 'victor-igboekwe',
      jobKey: { startsWith: 'marcus:' },
      lastStatus: { in: ['received', 'routed', 'in_progress', 'reconfirmation_required'] }
    },
    select: { id: true }
  });

  const taskIds = tasks.map(t => t.id);
  if (taskIds.length === 0) {
    return NextResponse.json({ frozen: 0, message: 'No pending Marcus tasks' });
  }

  // Update status to 'frozen'
  await prisma.agentJob.updateMany({
    where: { id: { in: taskIds } },
    data: { lastStatus: 'frozen' }
  });

  // Emit freeze events
  await prisma.action.createMany({
    data: taskIds.map(id => ({
      userId: 'victor-igboekwe',
      initiator: 'system',
      action: 'capability_marcus_task_frozen',
      status: 'EXECUTED',
      capabilityId: id,
      correlationId: `marcus:freeze:${Date.now()}`,
    }))
  });

  return NextResponse.json({ frozen: taskIds.length, taskIds });
}

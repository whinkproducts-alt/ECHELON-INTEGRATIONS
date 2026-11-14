import { NextResponse } from 'next/server';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const auth = requireMarcusAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Find all frozen Marcus tasks
  const tasks = await prisma.agentJob.findMany({
    where: {
      userId: 'victor-igboekwe',
      jobKey: { startsWith: 'marcus:' },
      lastStatus: 'frozen'
    },
    select: { id: true }
  });

  const taskIds = tasks.map(t => t.id);
  if (taskIds.length === 0) {
    return NextResponse.json({ unfrozen: 0, message: 'No frozen Marcus tasks' });
  }

  // Update status back to 'received' to re-queue
  await prisma.agentJob.updateMany({
    where: { id: { in: taskIds } },
    data: { lastStatus: 'received' }
  });

  // Emit unfreeze events
  await prisma.action.createMany({
    data: taskIds.map(id => ({
      userId: 'victor-igboekwe',
      initiator: 'system',
      action: 'capability_marcus_task_unfrozen',
      status: 'EXECUTED',
      capabilityId: id,
      correlationId: `marcus:unfreeze:${Date.now()}`,
    }))
  });

  return NextResponse.json({ unfrozen: taskIds.length, taskIds });
}

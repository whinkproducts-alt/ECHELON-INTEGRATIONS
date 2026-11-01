/**
 * Task handoff — structured record of what one agent accomplished so the next agent
 * can pick up without re-reading the full transcript.
 */

import { prisma } from '@/lib/db';
import type { TaskHandoff } from '@prisma/client';

export type { TaskHandoff };

export async function writeHandoff(params: {
  taskId: string;
  agentId: string;
  userId: string;
  summary: string;
  approach: string;
  blockers?: string;
  nextSteps?: string;
}): Promise<TaskHandoff> {
  return prisma.taskHandoff.create({
    data: {
      taskId: params.taskId,
      agentId: params.agentId,
      userId: params.userId,
      summary: params.summary,
      approach: params.approach,
      blockers: params.blockers ?? null,
      nextSteps: params.nextSteps ?? null,
    },
  });
}

export async function readHandoff(taskId: string, userId: string): Promise<TaskHandoff | null> {
  return prisma.taskHandoff.findFirst({
    where: { taskId, userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function readRecentHandoffs(
  agentId: string,
  userId: string,
  limit = 10,
): Promise<TaskHandoff[]> {
  return prisma.taskHandoff.findMany({
    where: { agentId, userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

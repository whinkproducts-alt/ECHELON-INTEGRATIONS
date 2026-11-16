/** Per-entity learning made visible: the lessons and swarm learnings each entity has written. Read-only. */
import { prisma } from '@/lib/db';

export async function entityLearning(userId: string, entityKey: string) {
  const [lessons, swarm, lessonCount] = await Promise.all([
    prisma.agentKnowledge.findMany({ where: { agentId: entityKey, OR: [{ accountId: userId }, { accountId: null }] }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, domain: true, taskType: true, lesson: true, outcome: true, createdAt: true } }),
    prisma.swarmLearning.findMany({ where: { userId, agentId: entityKey }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, text: true, confidence: true, createdAt: true } }),
    prisma.agentKnowledge.count({ where: { agentId: entityKey, OR: [{ accountId: userId }, { accountId: null }] } }),
  ]);
  return { lessonCount, lessons, swarm };
}

/** Counts per entity for the org screen (lessons only; one grouped query). */
export async function learningCounts(userId: string): Promise<Record<string, number>> {
  const g = await prisma.agentKnowledge.groupBy({ by: ['agentId'], where: { OR: [{ accountId: userId }, { accountId: null }] }, _count: true });
  return Object.fromEntries(g.map((r) => [r.agentId, r._count]));
}

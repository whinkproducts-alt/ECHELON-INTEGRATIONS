/**
 * Compound Agent Intelligence (CAI) — agent memory layer.
 *
 * Agents read relevant lessons before starting a task (readContext) and
 * write a debrief when the task completes (writeDebrief).
 *
 * Scoping note: AgentKnowledge is org-wide agent knowledge, not user-private.
 * It is scoped by agentId (the agent role, e.g. "backend-engineer"), not userId.
 */

import { prisma } from '@/lib/db';
import type { AgentKnowledge } from '@prisma/client';

export type { AgentKnowledge };

/**
 * Read relevant lessons before a task starts.
 *
 * Strategy:
 * 1. Fetch up to `limit` rows matching both domain AND taskType (most specific).
 * 2. If fewer than `limit` rows returned, backfill with same-domain rows
 *    (ordered by createdAt desc) until the limit is reached.
 *
 * When accountId is provided, returns lessons for that account AND global
 * curated lessons (accountId = null). This ensures tenants only see their own
 * lessons plus globally curated ones.
 */
export async function readContext(
  agentId: string,
  domain: string,
  taskType: string,
  limit = 10,
  accountId?: string
): Promise<AgentKnowledge[]> {
  const accountFilter = accountId
    ? { OR: [{ accountId }, { accountId: null }] }
    : {};

  const exact = await prisma.agentKnowledge.findMany({
    where: { agentId, domain, taskType, ...accountFilter },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  if (exact.length >= limit) {
    return exact;
  }

  const alreadyIds = new Set(exact.map((r) => r.id));
  const remaining = limit - exact.length;

  const backfill = await prisma.agentKnowledge.findMany({
    where: {
      agentId,
      domain,
      id: { notIn: alreadyIds.size > 0 ? [...alreadyIds] : undefined },
      ...accountFilter,
    },
    orderBy: { createdAt: 'desc' },
    take: remaining,
  });

  return [...exact, ...backfill];
}

/**
 * Write a debrief after a task completes.
 * Pass accountId to scope the lesson to a specific tenant.
 * Omit accountId (or pass null) for global/curated lessons.
 */
export async function writeDebrief(params: {
  agentId: string;
  domain: string;
  taskType: string;
  lesson: string;
  outcome: 'success' | 'failure' | 'partial';
  tags?: string[];
  accountId?: string;
}): Promise<AgentKnowledge> {
  return prisma.agentKnowledge.create({
    data: {
      agentId: params.agentId,
      domain: params.domain,
      taskType: params.taskType,
      lesson: params.lesson,
      outcome: params.outcome,
      tags: params.tags ? JSON.stringify(params.tags) : null,
      accountId: params.accountId ?? null,
    },
  });
}

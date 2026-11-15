import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';
import { ownerEmails } from '@/lib/owner';

export const MARCUS_JOB_PREFIX = 'marcus:';
// shortcut: no worker handler runs marcus:* jobs yet (Group B); a far-future nextRunAt stops the worker
// parking them as SKIPPED and overwriting their status. Remove when a handler exists.
export const MARCUS_NEVER_RUN = new Date('2100-01-01T00:00:00Z');
// shortcut: freeze flag stored as a sentinel AgentJob row, avoiding a migration; move to a real table in Group B.
const FREEZE_KEY = `${MARCUS_JOB_PREFIX}__freeze__`;
const FREEZABLE = ['received', 'routed', 'in_progress', 'reconfirmation_required'];

export async function resolveMarcusOwner(): Promise<{ id: string; email: string } | null> {
  const email = [...ownerEmails()][0];
  if (!email) return null;
  return prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
}

export async function isMarcusFrozen(userId: string): Promise<boolean> {
  const row = await prisma.agentJob.findUnique({ where: { jobKey_userId: { jobKey: FREEZE_KEY, userId } }, select: { lastStatus: true } });
  return row?.lastStatus === 'freeze_on';
}

/** Freeze or unfreeze all Marcus tasks and the intake gate. Returns affected task ids. */
export async function setMarcusFreeze(userId: string, on: boolean): Promise<string[]> {
  const from = on ? FREEZABLE : ['frozen'];
  const to = on ? 'frozen' : 'received';
  const correlationId = `marcus:${on ? 'freeze' : 'unfreeze'}:${Date.now()}`;
  return prisma.$transaction(async (tx) => {
    await tx.agentJob.upsert({
      where: { jobKey_userId: { jobKey: FREEZE_KEY, userId } },
      create: { jobKey: FREEZE_KEY, userId, nextRunAt: MARCUS_NEVER_RUN, lastStatus: on ? 'freeze_on' : 'freeze_off' },
      update: { lastStatus: on ? 'freeze_on' : 'freeze_off' },
    });
    const tasks = await tx.agentJob.findMany({
      where: { userId, jobKey: { startsWith: MARCUS_JOB_PREFIX }, lastStatus: { in: from } },
      select: { id: true },
    });
    const ids = tasks.map((t) => t.id);
    if (ids.length) await tx.agentJob.updateMany({ where: { id: { in: ids }, userId }, data: { lastStatus: to } });
    for (const id of ids) {
      await recordAction({
        userId, initiator: 'system', action: `capability_marcus_task_${on ? 'frozen' : 'unfrozen'}`,
        permissionClass: 'A', status: 'EXECUTED', capabilityId: id, correlationId,
      }, tx);
    }
    return ids;
  });
}

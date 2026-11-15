import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';
import { ownerEmails } from '@/lib/owner';
import { cancelExecution } from '@/lib/worker/ear-execution';

export const MARCUS_JOB_PREFIX = 'marcus:';
/** nextRunAt for a Marcus job that must not be claimed: frozen, waiting, blocked or finished. */
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

/**
 * Freeze or unfreeze all Marcus tasks and the intake gate. Returns affected task ids.
 * Freezing cancels a task's running analysis; an unfrozen task that had started is cancelled, not re-run,
 * because its approval was already used.
 */
export async function setMarcusFreeze(userId: string, on: boolean): Promise<string[]> {
  const from = on ? FREEZABLE : ['frozen'];
  const batch = `${on ? 'freeze' : 'unfreeze'}:${Date.now()}`;
  const { ids, started } = await prisma.$transaction(async (tx) => {
    await tx.agentJob.upsert({
      where: { jobKey_userId: { jobKey: FREEZE_KEY, userId } },
      create: { jobKey: FREEZE_KEY, userId, nextRunAt: MARCUS_NEVER_RUN, lastStatus: on ? 'freeze_on' : 'freeze_off' },
      update: { lastStatus: on ? 'freeze_on' : 'freeze_off' },
    });
    const tasks = await tx.agentJob.findMany({
      where: { userId, jobKey: { startsWith: MARCUS_JOB_PREFIX }, lastStatus: { in: from } },
      select: { id: true, capabilityReceiptId: true },
    });
    const ids = tasks.map((t) => t.id);
    const ranIds = tasks.filter((t) => t.capabilityReceiptId).map((t) => t.id);
    const freshIds = tasks.filter((t) => !t.capabilityReceiptId).map((t) => t.id);
    const set = (list: string[], data: { lastStatus: string; nextRunAt: Date }) => list.length ? tx.agentJob.updateMany({ where: { id: { in: list }, userId }, data }) : null;
    if (on) await set(ids, { lastStatus: 'frozen', nextRunAt: MARCUS_NEVER_RUN });
    else {
      await set(freshIds, { lastStatus: 'received', nextRunAt: new Date() });
      await set(ranIds, { lastStatus: 'cancelled', nextRunAt: MARCUS_NEVER_RUN });
    }
    for (const id of ids) {
      const cancelled = !on && ranIds.includes(id);
      await recordAction({
        userId, initiator: 'system', action: `capability_marcus_task_${on ? 'frozen' : cancelled ? 'cancelled' : 'unfrozen'}`,
        permissionClass: 'A', status: 'EXECUTED', correlationId: `marcus-task:${id}`, inputSummary: `batch=${batch}`,
      }, tx);
    }
    return { ids, started: on ? tasks.filter((t) => t.capabilityReceiptId).map((t) => t.capabilityReceiptId as string) : [] };
  });
  for (const executionId of started) await cancelExecution(userId, executionId);
  return ids;
}

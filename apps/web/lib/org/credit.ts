/** Owner-only credit links used by the viable_ideas and revenue_credit measures. */
import { prisma } from '@/lib/db';
import { writeLedger } from '@/lib/ledger';

export async function markIdeaViable(userId: string, ideaId: string, authorKey: string) {
  if (!(await prisma.orgEntity.findUnique({ where: { userId_key: { userId, key: authorKey } }, select: { id: true } }))) return false;
  const r = await prisma.founderIdea.updateMany({ where: { id: ideaId, userId }, data: { authorKey, viableAt: new Date() } });
  if (r.count) await writeLedger({ userId, initiator: 'user', action: 'org_idea_viable', permissionClass: 'A', status: 'EXECUTED', confirmationMethod: 'user_confirmed', metadata: { ideaId, authorKey } });
  return r.count > 0;
}

export async function setContractSource(userId: string, contractId: string, sourcedByKey: string) {
  if (!(await prisma.orgEntity.findUnique({ where: { userId_key: { userId, key: sourcedByKey } }, select: { id: true } }))) return false;
  const r = await prisma.contract.updateMany({ where: { id: contractId, userId }, data: { sourcedByKey } });
  if (r.count) await writeLedger({ userId, initiator: 'user', action: 'org_contract_source', permissionClass: 'A', status: 'EXECUTED', metadata: { contractId, sourcedByKey } });
  return r.count > 0;
}

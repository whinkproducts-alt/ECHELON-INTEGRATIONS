/**
 * Promotion and demotion are proposals, never automatic. Hash-locked to their content. Needs the person's line manager and
 * that manager's manager (Marcus Vale: the founder alone); a change to access or permissions also needs the founder.
 * Not the 30 s Class C window. This never moves pay or changes access by itself: pay is money (Class C, separate approval).
 */
import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { writeLedger } from '@/lib/ledger';
import { approvalChain, FOUNDER_KEY } from '@/lib/org/graph';
import { loadOrgNodes } from '@/lib/org/seed';
import { attainment, type MeasureCode } from '@/lib/org/measures';

export const proposalHash = (p: { entityKey: string; kind: string; toRole: string; changesAccess: boolean }) =>
  createHash('sha256').update(JSON.stringify([p.entityKey, p.kind, p.toRole, p.changesAccess])).digest('hex');

export async function createProposal(userId: string, p: { entityKey: string; kind: 'promote' | 'demote'; toRole: string; changesAccess?: boolean }, initiator: 'user' | 'system') {
  const nodes = await loadOrgNodes(userId);
  if (p.entityKey === FOUNDER_KEY) return { ok: false as const, error: 'the founder is not promoted by the system' };
  const requiredKeys = approvalChain(nodes, p.entityKey, !!p.changesAccess);
  if (requiredKeys.length === 0) return { ok: false as const, error: 'unknown entity or no approval chain' };
  const open = await prisma.orgPromotion.findFirst({ where: { userId, entityKey: p.entityKey, status: 'PENDING' }, select: { id: true } });
  if (open) return { ok: false as const, error: 'a proposal is already open for this entity' };
  const changesAccess = !!p.changesAccess;
  const row = await prisma.orgPromotion.create({ data: { userId, entityKey: p.entityKey, kind: p.kind, toRole: p.toRole, changesAccess, requiredKeys, contentHash: proposalHash({ ...p, changesAccess }) } });
  await writeLedger({ userId, initiator, action: 'org_promotion_proposed', permissionClass: 'A', status: 'AWAITING_APPROVAL', metadata: { id: row.id, entityKey: p.entityKey, kind: p.kind, requiredKeys } });
  return { ok: true as const, id: row.id, requiredKeys };
}

/**
 * Record one approver's decision. The caller route is owner-only: for approvers other than the founder this is a workflow
 * gate the owner records, never an agent approving. The hash must match, so edited content cannot ride an old approval.
 */
export async function decideProposal(userId: string, id: string, approverKey: string, decision: 'approve' | 'reject', contentHash: string) {
  const p = await prisma.orgPromotion.findFirst({ where: { id, userId } });
  if (!p) return { ok: false as const, error: 'not found' };
  if (p.status !== 'PENDING') return { ok: false as const, error: `already ${p.status.toLowerCase()}` };
  if (!p.requiredKeys.includes(approverKey)) return { ok: false as const, error: 'not a required approver' };
  if (contentHash !== p.contentHash || proposalHash(p) !== p.contentHash) return { ok: false as const, error: 'content hash mismatch' };
  try {
    await prisma.orgPromotionApproval.create({ data: { promotionId: id, approverKey, decision, contentHash } });
  } catch { return { ok: false as const, error: 'approver already decided' }; }
  const all = await prisma.orgPromotionApproval.findMany({ where: { promotionId: id } });
  const status = all.some((a) => a.decision === 'reject') ? 'REJECTED' : p.requiredKeys.every((k) => all.some((a) => a.approverKey === k && a.decision === 'approve')) ? 'APPROVED' : 'PENDING';
  if (status !== 'PENDING') await prisma.orgPromotion.updateMany({ where: { id, status: 'PENDING' }, data: { status, decidedAt: new Date() } });
  await writeLedger({ userId, initiator: 'user', action: 'org_promotion_decided', permissionClass: 'A', status: 'EXECUTED', confirmationMethod: 'user_confirmed', metadata: { id, approverKey, decision, resulting: status } });
  return { ok: true as const, status };
}

/** Open a promotion proposal when an entity met the owner's threshold for the owner's number of periods. Does nothing until both are set. */
export async function proposeFromScores(userId: string, kpis: { entityKey: string; measureCode: string; target: number; weight: number }[], nodes: Map<string, unknown>): Promise<number> {
  const pol = await prisma.orgPolicy.findUnique({ where: { userId } });
  if (!pol || pol.promotionThreshold === null || pol.periodsRequired === null) return 0;
  const N = pol.periodsRequired;
  let made = 0;
  for (const key of new Set(kpis.map((k) => k.entityKey))) {
    if (!nodes.has(key) || key === FOUNDER_KEY) continue;
    const mine = kpis.filter((k) => k.entityKey === key);
    const hist = await Promise.all(mine.map((k) => prisma.orgKpiScore.findMany({ where: { userId, entityKey: key, measureCode: k.measureCode }, orderBy: { periodStart: 'desc' }, take: N })));
    if (hist.some((h) => h.length < N || h.some((s) => s.value === null))) continue;
    let sustained = true;
    for (let i = 0; i < N; i++) {
      const w = mine.reduce((a, k) => a + k.weight, 0);
      const c = mine.reduce((a, k, j) => a + k.weight * attainment(k.measureCode as MeasureCode, hist[j][i].value as number, k.target), 0) / w;
      if (c < pol.promotionThreshold) { sustained = false; break; }
    }
    if (!sustained) continue;
    const r = await createProposal(userId, { entityKey: key, kind: 'promote', toRole: 'to be set by the approvers' }, 'system');
    if (r.ok) made++;
  }
  return made;
}

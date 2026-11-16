/** Twice-yearly subsidiary head review. A job opens it with ledger evidence; WHINK and MAMBA each add a view. MAMBA's is stored as a hypothesis (confidence at most 0.4). */
import { prisma } from '@/lib/db';
import { writeLedger } from '@/lib/ledger';
import { writeMemory } from '@/lib/memory-engine';

export const reviewPeriod = (d: Date) => `${d.getUTCFullYear()}-H${d.getUTCMonth() < 6 ? 1 : 2}`;

export async function openReviews(userId: string, now = new Date()): Promise<number> {
  const heads = await prisma.orgEntity.findMany({ where: { userId } });
  const subs = heads.filter((h) => h.roles.some((r) => r.startsWith('Subsidiary head:')));
  const period = reviewPeriod(now);
  let opened = 0;
  for (const h of subs) {
    const scores = await prisma.orgKpiScore.findMany({ where: { userId, entityKey: h.key }, orderBy: { periodStart: 'desc' }, take: 12 });
    const r = await prisma.orgReview.createMany({ data: [{ userId, entityKey: h.key, period, evidence: scores.map((s) => ({ m: s.measureCode, v: s.value, ok: s.meetsTarget, n: s.evidence })) }], skipDuplicates: true });
    opened += r.count;
  }
  if (opened) await writeLedger({ userId, initiator: 'system', action: 'org_review_opened', permissionClass: 'A', status: 'EXECUTED', metadata: { period, opened } });
  return opened;
}

export async function submitView(userId: string, reviewId: string, author: 'WHINK' | 'MAMBA', text: string) {
  const rv = await prisma.orgReview.findFirst({ where: { id: reviewId, userId } });
  if (!rv) return { ok: false as const, error: 'not found' };
  const t = text.trim().slice(0, 4000);
  if (!t) return { ok: false as const, error: 'empty view' };
  if (author === 'MAMBA') await writeMemory({ userId, type: 'hypothesis', statement: `Review ${rv.period} of ${rv.entityKey}: ${t}`.slice(0, 1000), source: 'MAMBA', confidence: 0.4, mambaMode: 'OBSIDIAN' });
  const data = author === 'WHINK' ? { whinkView: t } : { mambaView: t };
  const next = { whinkView: rv.whinkView, mambaView: rv.mambaView, ...data };
  await prisma.orgReview.update({ where: { id: reviewId }, data: { ...data, status: next.whinkView && next.mambaView ? 'COMPLETE' : 'OPEN' } });
  await writeLedger({ userId, initiator: 'user', persona: author, action: 'org_review_view', permissionClass: 'A', status: 'EXECUTED', metadata: { reviewId, author } });
  return { ok: true as const };
}

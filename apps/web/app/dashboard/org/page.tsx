import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isOwnerEmail } from '@/lib/owner';
import { learningCounts } from '@/lib/org/learning';
import { MEASURE_CODES } from '@/lib/org/measures';
import { OrgScreen } from './_components/org-screen';

export const dynamic = 'force-dynamic';

export default async function OrgPage() {
  const s = await auth();
  if (!s?.user?.id) redirect('/login');
  if (!isOwnerEmail(s.user.email)) return <p className="p-6 text-sm text-muted-foreground">Founder access required.</p>;
  const userId = s.user.id;
  const [entities, kpis, policy, promotions, reviews, courses, training, counts] = await Promise.all([
    prisma.orgEntity.findMany({ where: { userId, tier: { lte: 3 } }, orderBy: [{ tier: 'asc' }, { name: 'asc' }], select: { key: true, name: true, role: true, tier: true, managerKey: true } }),
    prisma.orgKpi.findMany({ where: { userId }, orderBy: { entityKey: 'asc' } }),
    prisma.orgPolicy.findUnique({ where: { userId } }),
    prisma.orgPromotion.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30, include: { approvals: true } }),
    prisma.orgReview.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.orgCourse.findMany({ where: { userId }, orderBy: { code: 'asc' } }),
    prisma.orgTraining.groupBy({ by: ['status'], where: { userId }, _count: true }),
    learningCounts(userId),
  ]);
  const agentCount = await prisma.orgEntity.count({ where: { userId, tier: 4 } });
  const scores = await prisma.orgKpiScore.findMany({ where: { userId }, orderBy: { periodStart: 'desc' }, take: 100 });
  const j = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  return <OrgScreen data={j({ entities, kpis, policy, promotions, reviews, courses, training, counts, agentCount, scores, measures: MEASURE_CODES })} />;
}

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isOwnerEmail } from '@/lib/owner';
import { learningCounts } from '@/lib/org/learning';
import { People } from './_components/people';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const s = await auth();
  if (!s?.user?.id) redirect('/login');
  if (!isOwnerEmail(s.user.email)) return <p className="p-6 text-sm text-muted-foreground">Founder access required.</p>;
  const [people, counts] = await Promise.all([
    prisma.orgEntity.findMany({ where: { userId: s.user.id, tier: { lte: 3 } }, orderBy: [{ tier: 'asc' }, { name: 'asc' }], select: { key: true, name: true, role: true, tier: true } }),
    learningCounts(s.user.id),
  ]);
  return <People people={people.filter((p) => p.key !== 'victor-igboekwe').map((p) => ({ ...p, lessons: counts[p.key] ?? 0 }))} />;
}

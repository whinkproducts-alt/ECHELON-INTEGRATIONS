import type { JobContext } from '@/lib/worker/context';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { seedOrg } from '@/lib/org/seed';
import { runScoring } from '@/lib/org/scoring';
import { openReviews } from '@/lib/org/review';
import { ensureTemplates, runTrainingScheduler } from '@/lib/org/training';

/** Daily: keep the org table in step with org-kit, score KPIs, open due reviews, schedule training. No model calls. */
export async function orgCycle(_ctx: JobContext): Promise<void> {
  const owner = await prisma.user.findFirst({ where: { email: process.env.WHINK_OWNER_EMAILS?.split(',')[0]?.trim() ?? '' }, select: { id: true } });
  if (!owner) { logger.warn('org_cycle: owner not found, skipping'); return; }
  await seedOrg(owner.id);
  await ensureTemplates(owner.id);
  const s = await runScoring(owner.id);
  const r = await openReviews(owner.id);
  const t = await runTrainingScheduler(owner.id);
  logger.info('org_cycle done', { ...s, reviewsOpened: r, ...t });
}

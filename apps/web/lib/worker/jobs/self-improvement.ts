import type { JobContext } from '@/lib/worker/context';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { runSelfImprovementCycle } from '@/lib/self-improvement';

/**
 * Self-improvement worker job.
 * Runs periodically to analyze interactions and propose/apply improvements.
 */
export async function selfImprovement(_ctx: JobContext): Promise<void> {
  // Get the owner user ID (founder)
  const owner = await prisma.user.findFirst({
    where: { email: process.env.WHINK_OWNER_EMAILS?.split(',')[0]?.trim() ?? '' },
    select: { id: true },
  });

  if (!owner) {
    logger.warn('self_improvement: owner not found, skipping');
    return;
  }

  const result = await runSelfImprovementCycle(owner.id);

  logger.info('self_improvement cycle completed', {
    patternsFound: result.patternsFound,
    proposalsGenerated: result.proposalsGenerated,
    improvementsApplied: result.improvementsApplied,
  });
}
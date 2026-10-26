/**
 * swarm_resume: re-attaches swarm runs whose engine died. resumeSwarms only touches runs with no recent
 * activity, so it is safe to run every few minutes beside a live engine. Scoped to the job's own user.
 */
import type { JobContext } from '@/lib/worker/context';
import { resumeSwarms } from '@/lib/swarm/engine';

export async function swarmResume(ctx: JobContext, resume: typeof resumeSwarms = resumeSwarms): Promise<void> {
  const n = await resume({ userId: ctx.userId });
  if (n === 0) ctx.counters.skipped++;
}

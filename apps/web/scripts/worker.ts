/**
 * Standing roster worker. Run with `pnpm worker`. Does nothing unless WORKER_ENABLED=true.
 * Loops every 15 s: heartbeat, create jobs for new users, claim due jobs (atomic lease), run them
 * with a concurrency cap. SIGTERM/SIGINT stop claiming and wait for running jobs (up to 30 s).
 * Several worker processes can run at once. Jobs never receive tools and never send anything.
 */
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger';
import { tick, workerConcurrency, type TickState } from '../lib/worker/runner';
import { runDueSpeechChecks } from '../lib/speech-services';

const LOOP_MS = 15_000;
const SHUTDOWN_GRACE_MS = 30_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (process.env.WORKER_ENABLED !== 'true') {
    console.log('worker disabled (set WORKER_ENABLED=true to run). Exiting.');
    return;
  }
  const workerId = `w-${process.pid}-${randomUUID().slice(0, 8)}`;
  const startedAt = new Date();
  const state: TickState = { lastDiscoverAt: 0, inFlight: new Set() };
  let stopping = false;
  let lastSpeechSweepAt = 0;
  let speechSweep: Promise<unknown> | null = null;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  logger.info('worker started', { workerId });

  while (!stopping) {
    try {
      if (!stopping && !speechSweep && state.inFlight.size < workerConcurrency() && Date.now() - lastSpeechSweepAt >= 60_000) {
        lastSpeechSweepAt = Date.now();
        // Keep the standing worker responsive; durable per-account leases prevent duplicates.
        // One account per sweep bounds work, while updatedAt ordering rotates account discovery.
        const work = runDueSpeechChecks(new Date(), 1).catch(() => {
          logger.warn('speech readiness sweep unavailable', { workerId });
        });
        speechSweep = work;
        state.inFlight.add(work);
        void work.finally(() => { state.inFlight.delete(work); speechSweep = null; });
      }
      await tick(workerId, startedAt, state);
    } catch (e) {
      logger.error('worker tick failed', { workerId, error: (e as Error)?.message });
    }
    // Sleep in short steps so a signal is noticed quickly.
    for (let waited = 0; waited < LOOP_MS && !stopping; waited += 500) await sleep(500);
  }

  logger.info('worker stopping', { workerId, running: state.inFlight.size });
  await Promise.race([Promise.allSettled([...state.inFlight]), sleep(SHUTDOWN_GRACE_MS)]);
  logger.info('worker stopped', { workerId });
}

main().then(() => process.exit(0)).catch((e) => {
  logger.error('worker crashed', { error: (e as Error)?.message });
  process.exit(1);
});

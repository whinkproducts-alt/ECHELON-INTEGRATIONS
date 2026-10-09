/**
 * Next.js instrumentation hook. Starts the scheduled-post worker once per Node.js process.
 * Single-instance by design: the worker claims rows atomically, so a second instance would be
 * safe but is not needed. Never runs in the Edge runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startScheduledPostWorker } = await import('@/lib/social/scheduler');
  startScheduledPostWorker();
}

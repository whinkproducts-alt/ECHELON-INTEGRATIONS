export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { requireOwner } from '@/lib/capability/api';
import { decodeCursor, encodeCursor, eventsAfter, latestCursor, type Cursor } from '@/lib/capability/events';

const POLL_MS = 2000;
const KEEPALIVE_MS = 15000;

/**
 * Server-sent events from the ledger. Reconnect with Last-Event-ID (the browser does this itself) or
 * ?cursor= to replay everything after that point; with no cursor the stream starts from now.
 */
export async function GET(req: Request) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const url = new URL(req.url);
  let cursor: Cursor | null = decodeCursor(req.headers.get('last-event-id') ?? url.searchParams.get('cursor'));
  if (!cursor) cursor = await latestCursor(who.userId);

  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      let busy = false;
      const stop = (): void => { clearInterval(timer); clearInterval(keepalive); try { controller.close(); } catch { /* already closed */ } };
      const tick = async (): Promise<void> => {
        if (busy) return;
        busy = true;
        try {
          for (;;) {
            const batch = await eventsAfter(who.userId, cursor, 200);
            for (const e of batch) {
              controller.enqueue(enc.encode(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`));
              cursor = decodeCursor(e.id);
            }
            if (batch.length < 200) break;
          }
        } catch {
          stop();
        } finally {
          busy = false;
        }
      };
      controller.enqueue(enc.encode(`retry: 3000\n: connected ${cursor ? encodeCursor(cursor) : 'start'}\n\n`));
      await tick();
      timer = setInterval(() => { void tick(); }, POLL_MS);
      keepalive = setInterval(() => { try { controller.enqueue(enc.encode(': keepalive\n\n')); } catch { stop(); } }, KEEPALIVE_MS);
      req.signal.addEventListener('abort', stop, { once: true });
    },
    cancel() { clearInterval(timer); clearInterval(keepalive); },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { holoBridge, type HoloEvent } from '@/lib/gesture/holo-bridge';

const HEARTBEAT_MS = 15_000;

/**
 * GET /api/gesture/stream: server sent events for the HOLO bridge.
 * Sends a full `snapshot` first (also the resync path after a reconnect), then `state`
 * and `gesture` events. Events hold ids and enums only.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const enc = new TextEncoder();
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: HoloEvent) => {
        try {
          controller.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
        } catch {
          cleanup?.();
        }
      };
      const unsub = holoBridge.subscribe(userId, send);
      if (!unsub) {
        controller.enqueue(enc.encode('event: error\ndata: {"error":"too_many_streams"}\n\n'));
        controller.close();
        return;
      }
      const hb = setInterval(() => {
        try { controller.enqueue(enc.encode(': hb\n\n')); } catch { cleanup?.(); }
      }, HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(hb);
        unsub();
        cleanup = null;
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener('abort', () => cleanup?.());
      send({ type: 'snapshot', state: holoBridge.getState(userId) });
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

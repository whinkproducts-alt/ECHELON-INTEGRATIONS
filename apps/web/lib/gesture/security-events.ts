import { logSecurityEvent } from '@/lib/permission-engine';

const last = new Map<string, number>();
const THROTTLE_MS = 10_000;

/**
 * Ledger a gesture security event, at most once per user and kind per 10 s, so a flood of
 * bad requests cannot be turned into a flood of ledger writes. Never throws.
 */
export async function gestureSecurityEvent(userId: string, kind: string, detail: string, correlationId: string): Promise<void> {
  const key = `${userId}:${kind}`;
  const now = Date.now();
  if (now - (last.get(key) ?? 0) < THROTTLE_MS) return;
  if (last.size > 5000) last.clear();
  last.set(key, now);
  try {
    await logSecurityEvent(userId, `gesture_${kind}`, detail.slice(0, 200), correlationId, 'DENIED');
  } catch {
    /* logSecurityEvent already logs; the request is rejected either way */
  }
}

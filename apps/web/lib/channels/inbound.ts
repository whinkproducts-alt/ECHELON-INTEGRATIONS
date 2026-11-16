/**
 * Inbound messaging core (backlog item 67). Every adapter parses its own payload into an InboundMessage and calls
 * handleInbound. Pairing runs before anything else: an unknown sender gets silence (`reply` is never set) and the
 * code is returned for the OWNER only. Message text is untrusted data. Adapters never send; every send is a Class C approval.
 */
import { timingSafeEqual, createHmac } from 'node:crypto';
import { requestPairing } from '@/lib/pairing';
import { wrapUntrustedContent } from '@/lib/content-isolation';

export const MAX_INBOUND_CHARS = 4000;
export type InboundMessage = { channel: string; senderId: string; text: string };
export type InboundResult =
  | { action: 'accept'; content: string }
  | { action: 'silent'; reason: 'pairing_pending' | 'pairing_limit'; ownerCode?: string };

export async function handleInbound(userId: string, m: InboundMessage): Promise<InboundResult> {
  const p = await requestPairing(userId, m.channel, m.senderId);
  if (p.status === 'pending') return { action: 'silent', reason: 'pairing_pending', ownerCode: p.code };
  if (p.status === 'limit') return { action: 'silent', reason: 'pairing_limit' };
  return { action: 'accept', content: wrapUntrustedContent(m.text.slice(0, MAX_INBOUND_CHARS), `channel:${m.channel}`, m.senderId) };
}

export function safeEqual(a: string, b: string): boolean {
  const x = createHmac('sha256', 'k').update(a).digest(), y = createHmac('sha256', 'k').update(b).digest();
  return timingSafeEqual(x, y);
}

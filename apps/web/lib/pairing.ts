/**
 * Sender pairing (backlog item 59, rule R3). An unknown sender on a messaging channel gets no reply until the owner
 * approves a one-time code. The code goes to the owner, never to the sender. Only a hash is stored. A pairing grants
 * the right to be answered and nothing else: every send still goes through the permission engine.
 */
import { createHash, randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';

export const PAIRING_TTL_MS = 60 * 60 * 1000;
export const MAX_PENDING_PER_CHANNEL = 5;
const hash = (code: string) => createHash('sha256').update(code).digest('hex');

export async function isPaired(userId: string, channel: string, senderId: string): Promise<boolean> {
  return !!(await prisma.channelPairing.findFirst({ where: { userId, channel, senderId, status: 'PAIRED' }, select: { id: true } }));
}

/** Called for an inbound message from a sender. Paired: answer. Otherwise the caller stays silent and shows `code` to the owner. */
export async function requestPairing(userId: string, channel: string, senderId: string, now = new Date()): Promise<{ status: 'paired' | 'pending' | 'limit'; code?: string }> {
  const existing = await prisma.channelPairing.findUnique({ where: { userId_channel_senderId: { userId, channel, senderId } } });
  if (existing?.status === 'PAIRED') return { status: 'paired' };
  if (existing?.status === 'REVOKED') return { status: 'limit' }; // a revoked sender stays blocked until the owner pairs them again
  const pending = await prisma.channelPairing.count({ where: { userId, channel, status: 'PENDING', expiresAt: { gt: now }, NOT: { senderId } } });
  if (pending >= MAX_PENDING_PER_CHANNEL) return { status: 'limit' };
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const data = { codeHash: hash(code), expiresAt: new Date(now.getTime() + PAIRING_TTL_MS), status: 'PENDING' };
  await prisma.channelPairing.upsert({ where: { userId_channel_senderId: { userId, channel, senderId } }, create: { userId, channel, senderId, ...data }, update: data });
  await recordAction({ userId, initiator: 'system', action: 'channel_pairing_requested', permissionClass: 'A', status: 'VALIDATED', correlationId: `pairing:${channel}`, inputSummary: `channel=${channel}` });
  return { status: 'pending', code };
}

/** Owner approves by code. The state change is a conditional update, so one code pairs one sender once. */
export async function approvePairing(userId: string, channel: string, code: string, now = new Date()): Promise<{ ok: boolean; senderId?: string }> {
  const row = await prisma.channelPairing.findFirst({ where: { userId, channel, status: 'PENDING', codeHash: hash(code), expiresAt: { gt: now } } });
  if (!row) return { ok: false };
  const won = await prisma.channelPairing.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'PAIRED', pairedAt: now, codeHash: null, expiresAt: null } });
  if (won.count !== 1) return { ok: false };
  await recordAction({ userId, initiator: 'user', action: 'channel_pairing_approved', permissionClass: 'B', status: 'EXECUTED', correlationId: `pairing:${channel}`, inputSummary: `channel=${channel}` });
  return { ok: true, senderId: row.senderId };
}

export async function revokePairing(userId: string, channel: string, senderId: string): Promise<boolean> {
  const r = await prisma.channelPairing.updateMany({ where: { userId, channel, senderId, status: { in: ['PAIRED', 'PENDING'] } }, data: { status: 'REVOKED', codeHash: null, expiresAt: null } });
  if (r.count) await recordAction({ userId, initiator: 'user', action: 'channel_pairing_revoked', permissionClass: 'B', status: 'EXECUTED', correlationId: `pairing:${channel}`, inputSummary: `channel=${channel}` });
  return r.count > 0;
}

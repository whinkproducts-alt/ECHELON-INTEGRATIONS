'use server';
import { auth } from '@/auth';
import { isOwnerEmail } from '@/lib/owner';
import { prisma } from '@/lib/db';
import { approvePairing, revokePairing } from '@/lib/pairing';
import { explainSandbox } from '@/lib/exec-policy';
import { getAllowList, parseProgramList, setAllowList } from '@/lib/owner-controls';

async function owner(): Promise<string> {
  const s = await auth();
  const id = (s?.user as { id?: string } | undefined)?.id;
  if (!id || !isOwnerEmail(s?.user?.email)) throw new Error('Owner accounts only.');
  return id;
}

export async function loadOwnerControls() {
  const userId = await owner();
  const pairings = await prisma.channelPairing.findMany({ where: { userId, status: { in: ['PENDING', 'PAIRED'] } }, orderBy: { createdAt: 'desc' }, take: 50, select: { channel: true, senderId: true, status: true } });
  return { pairings, allowList: await getAllowList(userId), sandbox: explainSandbox({ image: 'the sandbox image' }) };
}

export async function approvePairingAction(channel: string, code: string) {
  const userId = await owner();
  if (!/^[a-z0-9_-]{1,32}$/i.test(channel) || !/^\d{6}$/.test(code)) return { ok: false as const };
  return approvePairing(userId, channel, code);
}

export async function revokePairingAction(channel: string, senderId: string) {
  return revokePairing(await owner(), channel, senderId);
}

export async function saveAllowListAction(raw: string) {
  const userId = await owner();
  const r = parseProgramList(raw);
  if (!r.ok) return r;
  await setAllowList(userId, r.programs);
  return { ok: true as const, programs: r.programs };
}

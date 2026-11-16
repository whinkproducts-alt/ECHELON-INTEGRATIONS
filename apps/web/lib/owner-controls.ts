/** Owner-set command allow-list store (item 69). Feeds `classifyCommand` in lib/exec-policy.ts. Bare program names only. */
import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';

export const MAX_ALLOWED_PROGRAMS = 50;
const NAME = /^[a-z0-9][a-z0-9._+-]{0,63}$/i;

export function parseProgramList(raw: string): { ok: true; programs: string[] } | { ok: false; error: string } {
  const programs = [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
  if (programs.length > MAX_ALLOWED_PROGRAMS) return { ok: false, error: `At most ${MAX_ALLOWED_PROGRAMS} programs.` };
  const bad = programs.find((p) => !NAME.test(p));
  if (bad) return { ok: false, error: `"${bad.slice(0, 40)}" is not a bare program name (no paths, spaces or symbols).` };
  return { ok: true, programs };
}

export async function getAllowList(userId: string): Promise<string[]> {
  return (await prisma.commandAllowList.findUnique({ where: { userId } }))?.programs ?? [];
}

export async function setAllowList(userId: string, programs: string[]): Promise<void> {
  await prisma.commandAllowList.upsert({ where: { userId }, create: { userId, programs }, update: { programs } });
  await recordAction({ userId, initiator: 'user', action: 'command_allow_list_updated', permissionClass: 'B', status: 'EXECUTED', correlationId: 'exec-allow-list', inputSummary: `count=${programs.length}` });
}

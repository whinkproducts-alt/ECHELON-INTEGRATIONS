/**
 * Item 32 / FDR-007 + FDR-017: Founder-private memory and objectives stay sealed.
 * Private rows live under the owner's userId with scope FOUNDER_PRIVATE (semantic.scope, episode.privacyClass) or in
 * founder_objectives (private by construction). They are returned to the owner's own recall only on request and can
 * never be written into shared organisational memory (agent_knowledge): writeDebrief refuses a private source and
 * assertNoPrivateLeak refuses a lesson that quotes private text.
 */
import { prisma } from '@/lib/db';

export const FOUNDER_PRIVATE = 'founder_private';
export const FOUNDER_PRIVATE_CLASS = 'FOUNDER_PRIVATE';

export class PrivateScopeError extends Error {
  readonly code = 'FOUNDER_PRIVATE_SEALED';
  constructor(msg = 'Founder-private content cannot enter shared organisational memory.') { super(msg); this.name = 'PrivateScopeError'; }
}

export const isPrivateRow = (r: { scope?: string | null; privacyClass?: string | null }): boolean =>
  r.scope === FOUNDER_PRIVATE || r.privacyClass === FOUNDER_PRIVATE_CLASS;

/** Drop private rows unless the owner's own recall asked for them. */
export function filterPrivate<T extends { scope?: string | null; privacyClass?: string | null }>(rows: T[], includePrivate: boolean): T[] {
  return includePrivate ? rows : rows.filter((r) => !isPrivateRow(r));
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
function grams(s: string, n = 5): Set<string> {
  const w = words(s); const out = new Set<string>();
  if (w.length < n) { if (w.length) out.add(w.join(' ')); return out; }
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/** Pure check: does `text` quote (a 5-word run, or a whole short statement) any private text? */
export function quotesPrivate(text: string, privateTexts: string[]): boolean {
  const t = grams(text);
  return privateTexts.some((p) => { for (const g of grams(p)) if (t.has(g)) return true; return false; });
}

/** Throw PrivateScopeError when a candidate shared-memory text quotes this user's private memory or objectives. */
export async function assertNoPrivateLeak(userId: string, text: string): Promise<void> {
  if (!userId) throw new PrivateScopeError('userId is required');
  const [sem, epi, obj] = await Promise.all([
    prisma.memorySemantic.findMany({ where: { userId, scope: FOUNDER_PRIVATE, supersededBy: null }, select: { statement: true }, take: 500 }),
    prisma.memoryEpisode.findMany({ where: { userId, privacyClass: FOUNDER_PRIVATE_CLASS, supersededBy: null }, select: { summary: true }, take: 500 }),
    prisma.founderObjective.findMany({ where: { userId }, select: { title: true, detail: true }, take: 200 }),
  ]);
  const privateTexts = [...sem.map((r) => r.statement), ...epi.map((r) => r.summary), ...obj.flatMap((o) => [o.title, o.detail ?? ''])];
  if (quotesPrivate(text, privateTexts)) throw new PrivateScopeError();
}

// ── Durable founder objectives (private by construction: never joined into any shared read) ──
export const OBJECTIVE_STATUSES = ['ACTIVE', 'DONE', 'DROPPED'] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export async function createObjective(userId: string, input: { title: string; detail?: string }) {
  const title = input.title?.trim().slice(0, 200);
  if (!userId || !title) throw new Error('userId and title are required');
  return prisma.founderObjective.create({ data: { userId, title, detail: input.detail?.trim().slice(0, 4000) || null } });
}
export const listObjectives = (userId: string, status?: ObjectiveStatus) =>
  prisma.founderObjective.findMany({ where: { userId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
export async function setObjectiveStatus(userId: string, id: string, status: ObjectiveStatus): Promise<boolean> {
  if (!OBJECTIVE_STATUSES.includes(status)) return false;
  return (await prisma.founderObjective.updateMany({ where: { id, userId }, data: { status } })).count > 0;
}
export async function deleteObjective(userId: string, id: string): Promise<boolean> {
  return (await prisma.founderObjective.deleteMany({ where: { id, userId } })).count > 0;
}

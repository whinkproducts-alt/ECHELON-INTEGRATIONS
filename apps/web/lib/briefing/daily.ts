/**
 * R08 daily Board Room briefing, assembled only from the account's own records at a source cutoff:
 * project tasks, approvals, internal analyses, swarm runs and recorded model cost. No model writes it, so
 * nothing is invented: every line names its source screen, and a source that could not be read is said to be
 * unavailable rather than left out.
 *
 * Storage: one row per account, local date and revision. The script is encrypted with lib/key-encryption.ts;
 * without ENCRYPTION_KEY no script is stored and the briefing is composed again on each read. The sources column
 * holds kinds, counts and ids only.
 */
import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { decryptKey, encryptKey, isEncryptionConfigured } from '@/lib/key-encryption';
import { recordActionSafe } from '@/lib/ledger';
import { logger } from '@/lib/logger';

export const DAY_MS = 86_400_000;
const TITLE_MAX = 80;
const LIST_MAX = 3;

export type SourceKind = 'tasks' | 'approvals' | 'executions' | 'swarm' | 'usage';

export interface BriefingLine {
  kind: SourceKind | 'opening' | 'closing';
  text: string;
  /** In-app screen that shows the underlying records. */
  href?: string;
  /** True when the source could not be read. */
  unavailable?: boolean;
}

export interface BriefingSources {
  tasks: { overdue: Array<{ id: string; title: string }>; dueToday: Array<{ id: string; title: string }>; inProgress: number; blocked: number } | null;
  approvals: { pending: number; executed: number; denied: number; expired: number; failed: number } | null;
  executions: { running: number; succeeded: number; failed: number; blocked: number } | null;
  swarm: { running: number; done: number; failed: number } | null;
  usage: { costMicros: number; unknownCostCalls: number; events: number } | null;
}

export interface BriefingView {
  id: string | null;
  localDate: string;
  timeZone: string;
  revision: number;
  sourceCutoff: string;
  generatedAt: string;
  seen: boolean;
  lines: BriefingLine[];
  sourceCount: number;
  stored: boolean;
}

// ── Dates ────────────────────────────────────────────────────────────────────

export function safeTimeZone(tz: string | null | undefined): string {
  const z = (tz ?? '').trim() || 'UTC';
  try { new Intl.DateTimeFormat('en-CA', { timeZone: z }).format(0); return z; } catch { return 'UTC'; }
}

/** YYYY-MM-DD of `now` in the given IANA time zone. */
export function localDateFor(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: safeTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// ── Composition (pure) ───────────────────────────────────────────────────────

function cleanTitle(t: string): string {
  const s = String(t ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > TITLE_MAX ? `${s.slice(0, TITLE_MAX - 1)}…` : s || 'Untitled task';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function listTitles(items: Array<{ title: string }>): string {
  const shown = items.slice(0, LIST_MAX).map((i) => cleanTitle(i.title));
  const more = items.length - shown.length;
  return shown.join('; ') + (more > 0 ? `; and ${more} more` : '');
}

export function composeBriefing(src: BriefingSources, opts: { localDate: string; name?: string | null }): BriefingLine[] {
  const lines: BriefingLine[] = [];
  const who = opts.name?.trim() ? `, ${cleanTitle(opts.name).split(' ')[0]}` : '';
  lines.push({ kind: 'opening', text: `Good day${who}. Here is your briefing for ${opts.localDate}.` });

  if (!src.tasks) lines.push({ kind: 'tasks', text: 'Tasks are unavailable right now.', href: '/dashboard/tasks', unavailable: true });
  else {
    const t = src.tasks;
    if (t.overdue.length) lines.push({ kind: 'tasks', text: `${plural(t.overdue.length, 'task')} overdue: ${listTitles(t.overdue)}.`, href: '/dashboard/tasks' });
    if (t.dueToday.length) lines.push({ kind: 'tasks', text: `${plural(t.dueToday.length, 'task')} due today: ${listTitles(t.dueToday)}.`, href: '/dashboard/tasks' });
    if (t.inProgress || t.blocked) lines.push({ kind: 'tasks', text: `${plural(t.inProgress, 'task')} in progress${t.blocked ? `, ${t.blocked} blocked` : ''}.`, href: '/dashboard/tasks' });
    if (!t.overdue.length && !t.dueToday.length && !t.inProgress && !t.blocked) lines.push({ kind: 'tasks', text: 'No open tasks are due or in progress.', href: '/dashboard/tasks' });
  }

  if (!src.approvals) lines.push({ kind: 'approvals', text: 'Approvals are unavailable right now.', href: '/dashboard/approvals', unavailable: true });
  else {
    const a = src.approvals;
    const decided = a.executed + a.denied + a.expired + a.failed;
    const head = a.pending ? `${plural(a.pending, 'approval')} waiting for you now.` : 'Nothing is waiting for your approval.';
    const tail = decided ? ` In the last day: ${a.executed} ran, ${a.denied} denied, ${a.expired} expired${a.failed ? `, ${a.failed} failed` : ''}.` : '';
    lines.push({ kind: 'approvals', text: head + tail, href: '/dashboard/approvals' });
  }

  if (!src.executions) lines.push({ kind: 'executions', text: 'Agent work status is unavailable right now.', href: '/dashboard/tasks', unavailable: true });
  else if (src.executions.running + src.executions.succeeded + src.executions.failed + src.executions.blocked > 0) {
    const e = src.executions;
    lines.push({ kind: 'executions', text: `Agent analyses: ${e.running} running, ${e.succeeded} finished, ${e.failed} failed${e.blocked ? `, ${e.blocked} blocked by policy or cost` : ''}.`, href: '/dashboard/tasks' });
  }

  if (!src.swarm) lines.push({ kind: 'swarm', text: 'Swarm status is unavailable right now.', href: '/dashboard/swarm', unavailable: true });
  else if (src.swarm.running + src.swarm.done + src.swarm.failed > 0) {
    const s = src.swarm;
    lines.push({ kind: 'swarm', text: `Swarms: ${s.running} running, ${s.done} done, ${s.failed} failed in the last day.`, href: '/dashboard/swarm' });
  }

  if (!src.usage) lines.push({ kind: 'usage', text: 'Model cost is unavailable right now.', href: '/dashboard/usage', unavailable: true });
  else {
    const dollars = (src.usage.costMicros / 1_000_000).toFixed(2);
    const { events, unknownCostCalls } = src.usage;
    const priced = events - unknownCostCalls;
    const parts = [];
    if (priced) parts.push(`Estimated model cost in the last day: $${dollars} across ${plural(priced, 'call')}.`);
    if (unknownCostCalls) parts.push(`Cost unknown for ${plural(unknownCostCalls, 'call')}.`);
    lines.push({ kind: 'usage', text: parts.join(' ') || 'No model cost was recorded in the last day.', href: '/dashboard/usage' });
  }

  lines.push({ kind: 'closing', text: 'That is everything on record. Open any line to see its source.' });
  return lines;
}

export function sourceHash(src: BriefingSources): string {
  return createHash('sha256').update(JSON.stringify(src)).digest('hex');
}

/** Kinds, counts and ids only. Titles stay inside the encrypted script. */
export function sourceRefs(src: BriefingSources): Array<{ kind: SourceKind; ids?: string[]; count?: number; unavailable?: boolean }> {
  return [
    src.tasks ? { kind: 'tasks' as const, ids: [...src.tasks.overdue, ...src.tasks.dueToday].map((t) => t.id).slice(0, 20), count: src.tasks.inProgress } : { kind: 'tasks' as const, unavailable: true },
    src.approvals ? { kind: 'approvals' as const, count: src.approvals.pending } : { kind: 'approvals' as const, unavailable: true },
    src.executions ? { kind: 'executions' as const, count: src.executions.running } : { kind: 'executions' as const, unavailable: true },
    src.swarm ? { kind: 'swarm' as const, count: src.swarm.running } : { kind: 'swarm' as const, unavailable: true },
    src.usage ? { kind: 'usage' as const, count: src.usage.events } : { kind: 'usage' as const, unavailable: true },
  ];
}

// ── Gathering (database, account scoped) ─────────────────────────────────────

async function settle<T>(p: Promise<T>, what: string): Promise<T | null> {
  try { return await p; } catch (e) { logger.warn('briefing source unavailable', { source: what, error: (e as Error)?.message }); return null; }
}

export async function gatherSources(userId: string, cutoff: Date, timeZone: string): Promise<BriefingSources> {
  const since = new Date(cutoff.getTime() - DAY_MS);
  const today = localDateFor(timeZone, cutoff);
  const tasks = settle((async () => {
    const rows = await prisma.projectTask.findMany({
      where: { project: { ownerId: userId }, status: { not: 'DONE' } },
      select: { id: true, title: true, status: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
      take: 500,
    });
    const overdue: Array<{ id: string; title: string }> = [];
    const dueToday: Array<{ id: string; title: string }> = [];
    let inProgress = 0, blocked = 0;
    for (const r of rows) {
      if (r.status === 'IN_PROGRESS') inProgress++;
      if (r.status === 'BLOCKED') blocked++;
      if (!r.dueDate) continue;
      const d = localDateFor(timeZone, r.dueDate);
      if (d < today) overdue.push({ id: r.id, title: r.title });
      else if (d === today) dueToday.push({ id: r.id, title: r.title });
    }
    return { overdue, dueToday, inProgress, blocked };
  })(), 'tasks');
  const approvals = settle((async () => {
    const [pending, recent] = await Promise.all([
      prisma.approvalRequest.count({ where: { userId, status: 'PENDING', expiresAt: { gt: cutoff } } }),
      prisma.approvalRequest.groupBy({ by: ['status'], where: { userId, decidedAt: { gte: since, lte: cutoff } }, _count: { _all: true } }),
    ]);
    const n = (s: string) => recent.find((r) => r.status === s)?._count._all ?? 0;
    return { pending, executed: n('EXECUTED'), denied: n('DENIED'), expired: n('EXPIRED'), failed: n('FAILED') };
  })(), 'approvals');
  const executions = settle((async () => {
    const rows = await prisma.agentExecution.groupBy({ by: ['status'], where: { userId, updatedAt: { gte: since, lte: cutoff } }, _count: { _all: true } });
    const n = (...s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
    return { running: n('QUEUED', 'CLAIMED', 'RUNNING', 'RETRY_SCHEDULED'), succeeded: n('SUCCEEDED'), failed: n('FAILED'), blocked: n('BLOCKED_POLICY', 'BLOCKED_COST') };
  })(), 'executions');
  const swarm = settle((async () => {
    const rows = await prisma.swarmRun.groupBy({ by: ['status'], where: { userId, updatedAt: { gte: since, lte: cutoff } }, _count: { _all: true } });
    const n = (...s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
    return { running: n('RUNNING', 'FINALIZING'), done: n('DONE'), failed: n('FAILED') };
  })(), 'swarm');
  const usage = settle((async () => {
    const agg = await prisma.usageEvent.aggregate({ where: { userId, createdAt: { gte: since, lte: cutoff } }, _sum: { costMicros: true }, _count: { costMicros: true, _all: true } });
    return { costMicros: agg._sum.costMicros ?? 0, unknownCostCalls: agg._count._all - agg._count.costMicros, events: agg._count._all };
  })(), 'usage');
  const [t, a, e, s, u] = await Promise.all([tasks, approvals, executions, swarm, usage]);
  return { tasks: t, approvals: a, executions: e, swarm: s, usage: u };
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function userContext(userId: string): Promise<{ timeZone: string; name: string | null }> {
  const [profile, user] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId }, select: { timezone: true } }).catch(() => null),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null),
  ]);
  return { timeZone: safeTimeZone(profile?.timezone), name: user?.name ?? null };
}

type Row = { id: string; localDate: string; timeZone: string; revision: number; scriptEnc: string | null; sourceCount: number; sourceCutoff: Date; createdAt: Date; seenAt: Date | null };

function toView(row: Row, lines: BriefingLine[]): BriefingView {
  return {
    id: row.id, localDate: row.localDate, timeZone: row.timeZone, revision: row.revision, sourceCutoff: row.sourceCutoff.toISOString(),
    generatedAt: row.createdAt.toISOString(), seen: row.seenAt !== null, lines, sourceCount: row.sourceCount, stored: row.scriptEnc !== null,
  };
}

function readScript(row: Row): BriefingLine[] | null {
  if (!row.scriptEnc) return null;
  try {
    const parsed: unknown = JSON.parse(decryptKey(row.scriptEnc));
    return Array.isArray(parsed) ? (parsed as BriefingLine[]) : null;
  } catch { return null; }
}

async function createRevision(userId: string, now: Date, ctx: { timeZone: string; name: string | null }, revision: number): Promise<BriefingView> {
  const localDate = localDateFor(ctx.timeZone, now);
  const src = await gatherSources(userId, now, ctx.timeZone);
  const lines = composeBriefing(src, { localDate, name: ctx.name });
  const scriptEnc = isEncryptionConfigured() ? encryptKey(JSON.stringify(lines)) : null;
  const row = await prisma.dailyBriefing.create({
    data: {
      userId, localDate, timeZone: ctx.timeZone, revision, sourceHash: sourceHash(src), sourceCount: lines.filter((l) => l.href).length,
      sources: sourceRefs(src), scriptEnc, sourceCutoff: now,
    },
  });
  await recordActionSafe({
    userId, initiator: 'system', persona: 'WHINK', action: 'daily_briefing_generated', tool: 'daily_briefing', permissionClass: 'A',
    status: 'EXECUTED', inputSummary: `date=${localDate} rev=${revision} unavailable=${lines.filter((l) => l.unavailable).length}`,
    correlationId: `briefing-${row.id}`,
  });
  return toView(row, lines);
}

/** Latest revision for today, generated on first request of the local day. Concurrent first requests share one row. */
export async function getTodaysBriefing(userId: string, now = new Date()): Promise<BriefingView> {
  if (!userId) throw new Error('briefing: userId is required');
  const ctx = await userContext(userId);
  const localDate = localDateFor(ctx.timeZone, now);
  const existing = await prisma.dailyBriefing.findFirst({ where: { userId, localDate }, orderBy: { revision: 'desc' } }) as Row | null;
  if (existing) {
    const lines = readScript(existing) ?? composeBriefing(await gatherSources(userId, existing.sourceCutoff, existing.timeZone), { localDate, name: ctx.name });
    return toView(existing, lines);
  }
  try {
    return await createRevision(userId, now, ctx, 1);
  } catch (e) {
    // P2002: another request created revision 1 first. Read it.
    if ((e as { code?: string })?.code !== 'P2002') throw e;
    const row = await prisma.dailyBriefing.findFirst({ where: { userId, localDate }, orderBy: { revision: 'desc' } }) as Row | null;
    if (!row) throw e;
    return toView(row, readScript(row) ?? composeBriefing(await gatherSources(userId, row.sourceCutoff, row.timeZone), { localDate, name: ctx.name }));
  }
}

export async function regenerateBriefing(userId: string, now = new Date()): Promise<BriefingView> {
  const ctx = await userContext(userId);
  const localDate = localDateFor(ctx.timeZone, now);
  const last = await prisma.dailyBriefing.findFirst({ where: { userId, localDate }, orderBy: { revision: 'desc' }, select: { revision: true } });
  return createRevision(userId, now, ctx, (last?.revision ?? 0) + 1);
}

/** Record that the Founder saw (or skipped) the briefing. Server-side, so another device does not replay it. */
export async function markBriefingSeen(userId: string, id: string, now = new Date()): Promise<boolean> {
  const r = await prisma.dailyBriefing.updateMany({ where: { id, userId, seenAt: null }, data: { seenAt: now } });
  return r.count === 1;
}

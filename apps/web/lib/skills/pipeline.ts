/**
 * Skill pipeline: QUEUED -> SCANNING -> (REJECTED_SECURITY | ASSESSING) -> (ACCEPTED | REJECTED_VALUE),
 * with WAITING_MODEL / FAILED for model trouble. Every transition is one atomic conditional update
 * (updateMany ... where status in expected) and one ledger row, so two runners never double-process.
 *
 * Safety: the skill is untrusted data. The only effect of acceptance is reference memory rows tagged
 * sourceType 'skill_upload'. Nothing here registers tools, touches permissions or autonomy, approves
 * anything or reaches the org-kit executed skill registry.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { recordActionSafe, type LedgerStatus } from '@/lib/ledger';
import { checkPermission } from '@/lib/permission-engine';
import { writeMemory } from '@/lib/memory-engine';
import { stripFakeUntrustedTags } from '@/lib/content-isolation';
import { logger } from '@/lib/logger';
import config from '@/config/skill-pipeline.json';
import { scanSkill, isBlocking, type ScanReport } from './scanner';
import { pickCommittee, pickSecurityAgent } from './agents';
import { ModelStageError, pipelineModel, reviewedText, runDirectorVote, runSecurityReview, type DirectorVote, type SecurityVerdict } from './model';
import { packContent, unpackContent } from './intake';
import { SKILL_SOURCE_TYPE } from './labels';

export type SkillStatus =
  | 'QUEUED' | 'SCANNING' | 'REJECTED_SECURITY' | 'ASSESSING' | 'ACCEPTED' | 'REJECTED_VALUE' | 'WAITING_MODEL' | 'FAILED';

const LEDGER_STATUS: Record<SkillStatus, LedgerStatus> = {
  QUEUED: 'SUBMITTED', SCANNING: 'VALIDATED', ASSESSING: 'VALIDATED', ACCEPTED: 'EXECUTED',
  REJECTED_SECURITY: 'DENIED', REJECTED_VALUE: 'DENIED', WAITING_MODEL: 'UNVERIFIED', FAILED: 'FAILED',
};

export const correlationFor = (id: string) => `skill-${id}`;

async function ledger(userId: string, id: string, action: string, status: LedgerStatus, summary: Record<string, unknown>): Promise<void> {
  await recordActionSafe({
    userId, initiator: 'system', persona: 'WHINK', action, tool: 'skill_pipeline', permissionClass: 'A', status,
    correlationId: correlationFor(id), inputSummary: JSON.stringify({ submissionId: id, ...summary }),
  });
}

export class LeaseLostError extends Error {
  constructor() { super('lease lost'); }
}

const leaseMs = () => config.leaseMinutes * 60_000;
const ACTIVE: SkillStatus[] = ['SCANNING', 'ASSESSING'];

/** Extend the lease. Throws LeaseLostError when this runner no longer owns the submission. */
async function renew(userId: string, id: string, owner: string): Promise<void> {
  const res = await prisma.skillSubmission.updateMany({
    where: { id, userId, leaseOwner: owner, status: { in: ACTIVE } },
    data: { leaseUntil: new Date(Date.now() + leaseMs()) },
  });
  if (res.count !== 1) throw new LeaseLostError();
}

/**
 * Atomic conditional transition: status must match AND this runner must own the lease.
 * Moving to a non-active status releases the lease. Returns true only for the caller that won it.
 */
async function transition(
  userId: string, id: string, from: SkillStatus[], to: SkillStatus,
  data: Record<string, unknown>, note: Record<string, unknown>, owner: string,
): Promise<boolean> {
  const lease = ACTIVE.includes(to) ? { leaseUntil: new Date(Date.now() + leaseMs()) } : { leaseOwner: null, leaseUntil: null };
  const res = await prisma.skillSubmission.updateMany({
    where: { id, userId, status: { in: from }, leaseOwner: owner },
    data: { ...data, ...lease, status: to },
  });
  if (res.count !== 1) return false;
  await ledger(userId, id, `skill_${to.toLowerCase()}`, LEDGER_STATUS[to], { from: from.join('|'), to, ...note });
  return true;
}

// ── Enqueue ──────────────────────────────────────────────────────────────

export async function enqueueSubmission(
  userId: string,
  file: { name: string; filename: string; sha256: string; sizeBytes: number; text: string },
): Promise<{ id: string; duplicate: boolean }> {
  const existing = await prisma.skillSubmission.findFirst({ where: { userId, sha256: file.sha256 }, select: { id: true } });
  if (existing) return { id: existing.id, duplicate: true };
  try {
    const row = await prisma.skillSubmission.create({
      data: {
        userId, name: file.name, filename: file.filename, sha256: file.sha256, sizeBytes: file.sizeBytes,
        status: 'QUEUED', content: packContent(file.text), memoryIds: [],
      },
      select: { id: true },
    });
    await ledger(userId, row.id, 'skill_queued', 'SUBMITTED', { sizeBytes: file.sizeBytes, sha256: file.sha256 });
    return { id: row.id, duplicate: false };
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') {
      const again = await prisma.skillSubmission.findFirst({ where: { userId, sha256: file.sha256 }, select: { id: true } });
      if (again) return { id: again.id, duplicate: true };
    }
    throw e;
  }
}

export async function countToday(userId: string, now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return prisma.skillSubmission.count({ where: { userId, createdAt: { gte: start } } });
}

/** Detached start. Never throws, never awaited by the request. */
export function startProcessing(userId: string, id: string): void {
  void processSubmission(userId, id).catch((e) => logger.error('skill pipeline crashed', { userId, submissionId: id, error: (e as Error)?.message }));
}

// ── Processing ───────────────────────────────────────────────────────────

export type ProcessOutcome = SkillStatus | 'SKIPPED';

async function modelTrouble(userId: string, id: string, from: SkillStatus, err: unknown, extra: Record<string, unknown>, owner: string): Promise<ProcessOutcome> {
  const row = await prisma.skillSubmission.findFirst({ where: { id, userId }, select: { attempts: true } });
  const attempts = (row?.attempts ?? 0) + 1;
  const kind = err instanceof ModelStageError ? err.kind : 'unavailable';
  const exhausted = attempts >= config.maxAttempts;
  const to: SkillStatus = exhausted ? 'FAILED' : 'WAITING_MODEL';
  const reason = exhausted
    ? `Model stage failed ${attempts} times (${kind}); not accepted.`
    : `Model stage ${kind === 'invalid' ? 'returned an invalid verdict' : 'unavailable'}; waiting to retry. Not accepted.`;
  const applied = await transition(userId, id, [from], to, { attempts, reason, decision: exhausted ? 'failed' : 'waiting_model', ...extra }, { attempts, kind }, owner);
  return applied ? to : 'SKIPPED';
}

function sumReasons(votes: DirectorVote[]): string {
  return votes.flatMap((v) => v.reasons).join(' ').slice(0, 400);
}

export function chunkText(text: string, size = config.chunkChars, max = config.maxChunks): string[] {
  const paras = text.split(/\n{2,}/);
  const out: string[] = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    if (p.length > size) {
      push();
      for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size).trim());
      continue;
    }
    if (cur.length + p.length + 2 > size) push();
    cur += (cur ? '\n\n' : '') + p;
  }
  push();
  return out.filter(Boolean).slice(0, max);
}

function cleanForMemory(s: string): string {
  return stripFakeUntrustedTags(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\[\/?UNTRUSTED/gi, '(untrusted');
}

async function acceptIntoMemory(userId: string, id: string, name: string, filename: string, fullText: string, votes: DirectorVote[], owner: string): Promise<{ ids: string[]; note: Record<string, unknown> }> {
  const corr = correlationFor(id);
  const perm = await checkPermission(userId, 'skill_memory_write', 'A', corr, { params: { submission: id } });
  if (!perm.allowed) throw new Error('skill_memory_write was not permitted');

  const summary = cleanForMemory(`Summary of skill "${name}" (${filename}): ${sumReasons(votes)}`);
  // Only text a model saw may be stored. The tail beyond the review window is never chunked.
  const text = reviewedText(fullText);
  const chunks = chunkText(cleanForMemory(text));
  if (text.length > config.maxModelChars) throw new Error('memory content exceeds reviewed text');
  const statements = [summary, ...chunks.map((c, i) => cleanForMemory(`Skill "${name}" part ${i + 1} of ${chunks.length}: ${c}`))]
    .map((s) => `Uploaded skill (untrusted reference): ${s}`.slice(0, 2000));

  const ids: string[] = [];
  let deduped = 0;
  try {
    for (const statement of statements) {
      await renew(userId, id, owner);
      const dup = await prisma.memorySemantic.findFirst({ where: { userId, sourceType: SKILL_SOURCE_TYPE, statement }, select: { id: true } });
      if (dup) { deduped++; continue; }
      const r = await writeMemory({
        userId, type: 'semantic', statement, source: SKILL_SOURCE_TYPE, sourceId: id,
        confidence: Math.min(config.memoryConfidenceCap, 0.6), epistemicStatus: 'INFERRED',
      });
      if (r.deduped) { deduped++; continue; }
      ids.push(r.id);
    }
  } catch (e) {
    await prisma.memorySemantic.deleteMany({ where: { userId, id: { in: ids }, sourceType: SKILL_SOURCE_TYPE } });
    throw e;
  }
  return { ids, note: { chunks: chunks.length, deduped } };
}

export async function processSubmission(userId: string, id: string): Promise<ProcessOutcome> {
  if (!userId || !id) throw new Error('skills: userId and id are required');
  const owner = randomUUID();
  // Claim: status must be startable AND the lease empty or expired. Exactly one runner wins.
  const now = new Date();
  const claim = await prisma.skillSubmission.updateMany({
    where: { id, userId, status: { in: ['QUEUED', 'WAITING_MODEL'] }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { status: 'SCANNING', leaseOwner: owner, leaseUntil: new Date(now.getTime() + leaseMs()) },
  });
  if (claim.count !== 1) return 'SKIPPED';
  await ledger(userId, id, 'skill_scanning', LEDGER_STATUS.SCANNING, { from: 'QUEUED|WAITING_MODEL', to: 'SCANNING' });
  try {
    return await runStages(userId, id, owner);
  } catch (e) {
    if (e instanceof LeaseLostError) return 'SKIPPED';
    throw e;
  }
}

async function runStages(userId: string, id: string, owner: string): Promise<ProcessOutcome> {
  const T = (from: SkillStatus[], to: SkillStatus, data: Record<string, unknown> = {}, note: Record<string, unknown> = {}) =>
    transition(userId, id, from, to, data, note, owner);

  const row = await prisma.skillSubmission.findFirst({ where: { id, userId } });
  if (!row) return 'SKIPPED';
  let text: string;
  try {
    text = unpackContent(row.content);
  } catch {
    await T(['SCANNING'], 'FAILED', { decision: 'failed', reason: 'Stored content could not be read.' });
    return 'FAILED';
  }
  if (text.length > config.maxModelChars) {
    await T(['SCANNING'], 'FAILED', { decision: 'failed', reason: `Skill text exceeds the ${config.maxModelChars} character review limit; nothing unreviewed is stored.` }, { stage: 'length' });
    return 'FAILED';
  }

  // Stage 1: deterministic scan. A critical finding stops here, no model call.
  const report = scanSkill(text);
  if (isBlocking(report)) {
    const rules = report.findings.filter((f) => f.severity === 'CRITICAL').map((f) => f.rule);
    await T(['SCANNING'], 'REJECTED_SECURITY',
      { scanReport: report as never, decision: 'rejected_security', reason: `Deterministic scan blocked this skill (${(rules.length ? rules : ['score']).slice(0, 5).join(', ')}).` },
      { stage: 'scan', score: report.score, rules: rules.slice(0, 10) });
    return 'REJECTED_SECURITY';
  }

  const model = pipelineModel();
  if (!model) {
    await T(['SCANNING'], 'WAITING_MODEL', { scanReport: report as never, decision: 'waiting_model', reason: 'No model is configured. Waiting; not accepted.' });
    return 'WAITING_MODEL';
  }

  // Stage 2: cyber security agent (skipped on resume if it already returned clean).
  type StoredReport = ScanReport & { agent?: { id: string; name: string; verdict: SecurityVerdict } };
  const prior = row.scanReport as unknown as StoredReport | null;
  let agentInfo = prior?.agent && prior.agent.verdict.verdict === 'clean' ? prior.agent : null;
  if (!agentInfo) {
    try {
      await renew(userId, id, owner);
      const agent = await pickSecurityAgent(text);
      const verdict = await runSecurityReview(model, agent, id, text);
      agentInfo = { id: agent.id, name: agent.name, verdict };
    } catch (e) {
      if (e instanceof LeaseLostError) throw e;
      return modelTrouble(userId, id, 'SCANNING', e, { scanReport: report as never }, owner);
    }
    const full = { ...report, agent: agentInfo } as StoredReport;
    const v = agentInfo.verdict;
    if (v.verdict !== 'clean' || v.confidence < config.securityMinConfidence) {
      const ok = await T(['SCANNING'], 'REJECTED_SECURITY',
        { scanReport: full as never, decision: 'rejected_security', reason: `Security review (${agentInfo.name}) judged this skill ${v.verdict === 'clean' ? 'uncertain' : v.verdict}.` },
        { stage: 'security_agent', verdict: v.verdict, confidence: v.confidence });
      return ok ? 'REJECTED_SECURITY' : 'SKIPPED';
    }
    if (!(await T(['SCANNING'], 'ASSESSING', { scanReport: full as never }, { stage: 'security_agent', verdict: 'clean' }))) return 'SKIPPED';
  } else {
    if (!(await T(['SCANNING'], 'ASSESSING', {}, { stage: 'security_agent', verdict: 'clean', resumed: true }))) return 'SKIPPED';
  }

  // Stage 3: committee of three directors.
  let directors: Awaited<ReturnType<typeof pickCommittee>>;
  let votes: DirectorVote[];
  try {
    await renew(userId, id, owner);
    directors = await pickCommittee(text);
    votes = await Promise.all(directors.map(async (d) => { await renew(userId, id, owner); return runDirectorVote(model, d, id, text); }));
  } catch (e) {
    if (e instanceof LeaseLostError) throw e;
    return modelTrouble(userId, id, 'ASSESSING', e, {}, owner);
  }
  const approvals = votes.filter((v) => v.approve).length;
  const mean = votes.reduce((s, v) => s + v.valueScore, 0) / votes.length;
  const accepted = approvals >= config.minApprovals && mean >= config.valueThreshold;
  const committee = {
    threshold: config.valueThreshold, minApprovals: config.minApprovals, approvals, meanScore: Math.round(mean * 100) / 100,
    members: directors.map((d, i) => ({ id: d.id, name: d.name, directorate: d.directorate, vote: votes[i] })),
  };

  if (!accepted) {
    const ok = await T(['ASSESSING'], 'REJECTED_VALUE',
      { committee: committee as never, decision: 'rejected_value', reason: `Committee did not accept: ${approvals} of ${votes.length} approved, mean value ${committee.meanScore} (needs ${config.minApprovals} approvals and ${config.valueThreshold}).` },
      { stage: 'committee', approvals, mean: committee.meanScore });
    return ok ? 'REJECTED_VALUE' : 'SKIPPED';
  }

  // Stage 4: write to memory (each write re-checks the lease), then finish the transition.
  let memoryIds: string[];
  let acceptNote: Record<string, unknown>;
  try {
    ({ ids: memoryIds, note: acceptNote } = await acceptIntoMemory(userId, id, row.name, row.filename, text, votes, owner));
  } catch (e) {
    if (e instanceof LeaseLostError) return 'SKIPPED';
    logger.error('skill memory write failed', { userId, submissionId: id, error: (e as Error)?.message });
    await T(['ASSESSING'], 'FAILED', { committee: committee as never, decision: 'failed', reason: 'Accepted by the committee but memory could not be written.' });
    return 'FAILED';
  }
  const done = await T(['ASSESSING'], 'ACCEPTED',
    { committee: committee as never, decision: 'accepted', reason: `Accepted: ${approvals} of ${votes.length} approved, mean value ${committee.meanScore}.`, memoryIds },
    { stage: 'accept', memoryIds, ...acceptNote });
  if (!done) {
    // Lost the lease or deleted while writing: remove what this runner added.
    await prisma.memorySemantic.deleteMany({ where: { userId, id: { in: memoryIds }, sourceType: SKILL_SOURCE_TYPE } });
    return 'SKIPPED';
  }
  return 'ACCEPTED';
}

// ── Sweeper ──────────────────────────────────────────────────────────────

const WAITING_RETRY_MS = 60_000;

/**
 * Re-queues submissions stuck in SCANNING/ASSESSING for more than stalledMinutes and retries
 * WAITING_MODEL ones. Pass userId to limit to one account (the route does); the 24/7 worker passes none.
 * Returns the number started. Processing is detached.
 */
export async function resumeStalled(opts: { userId?: string; now?: Date; limit?: number } = {}): Promise<{ requeued: number; started: number }> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 25;
  const scope = opts.userId ? { userId: opts.userId } : {};
  const stalledBefore = new Date(now.getTime() - config.stalledMinutes * 60_000);
  const stalled = await prisma.skillSubmission.findMany({
    where: { ...scope, status: { in: ['SCANNING', 'ASSESSING'] }, updatedAt: { lt: stalledBefore }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    select: { id: true, userId: true, status: true }, take: limit,
  });
  let requeued = 0;
  const toStart: Array<{ userId: string; id: string }> = [];
  for (const s of stalled) {
    const res = await prisma.skillSubmission.updateMany({
      where: { id: s.id, userId: s.userId, status: s.status, updatedAt: { lt: stalledBefore }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { status: 'QUEUED', leaseOwner: null, leaseUntil: null },
    });
    if (res.count === 1) {
      requeued++;
      await ledger(s.userId, s.id, 'skill_requeued', 'SUBMITTED', { from: s.status, to: 'QUEUED', reason: 'stalled' });
      toStart.push({ userId: s.userId, id: s.id });
    }
  }
  const queued = await prisma.skillSubmission.findMany({
    where: { ...scope, status: 'QUEUED', updatedAt: { lt: new Date(now.getTime() - WAITING_RETRY_MS) } },
    select: { id: true, userId: true }, take: limit,
  });
  for (const q of queued) if (!toStart.some((t) => t.id === q.id)) toStart.push({ userId: q.userId, id: q.id });
  if (pipelineModel()) {
    const waiting = await prisma.skillSubmission.findMany({
      where: { ...scope, status: 'WAITING_MODEL', updatedAt: { lt: new Date(now.getTime() - WAITING_RETRY_MS) } },
      select: { id: true, userId: true }, take: limit,
    });
    for (const w of waiting) if (!toStart.some((t) => t.id === w.id)) toStart.push(w);
  }
  for (const t of toStart.slice(0, limit)) startProcessing(t.userId, t.id);
  return { requeued, started: Math.min(toStart.length, limit) };
}

// ── Delete ───────────────────────────────────────────────────────────────

export async function deleteSubmission(userId: string, id: string): Promise<boolean> {
  const row = await prisma.skillSubmission.findFirst({ where: { id, userId }, select: { id: true, memoryIds: true, status: true } });
  if (!row) return false;
  const mem = await prisma.memorySemantic.deleteMany({
    where: { userId, sourceType: SKILL_SOURCE_TYPE, OR: [{ id: { in: row.memoryIds } }, { sourceId: id }] },
  });
  const del = await prisma.skillSubmission.deleteMany({ where: { id, userId } });
  if (del.count !== 1) return false;
  await ledger(userId, id, 'skill_deleted', 'EXECUTED', { memoryRowsRemoved: mem.count, wasStatus: row.status });
  return true;
}

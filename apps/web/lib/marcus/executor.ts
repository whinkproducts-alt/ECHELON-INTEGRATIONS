/**
 * Runs a Marcus task by admitting it as a local, tool-free internal-analysis execution (the existing EAR
 * path) and mirroring that execution's state back onto the Marcus job. Victor's Marcus approval is the
 * authority; it is consumed exactly once when the execution is admitted. Nothing here calls a model.
 */
import { createHash } from 'node:crypto';
import { buildAuthorizationRequest } from '@whink/org-kit';
import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';
import { canonicalJson, approvalContentHash } from '@/lib/canonical-json';
import { decryptKey } from '@/lib/key-encryption';
import { extractRequiredSkills } from '@/lib/task-gate';
import { budgetState } from '@/lib/budget';
import { analysisRoute, cancelExecution, enqueueApprovedEar } from '@/lib/worker/ear-execution';
import { MARCUS_NEVER_RUN } from '@/lib/marcus/freeze';
import { matchDirectorate, subsidiaryContext } from '@/lib/marcus/routing';
import { getOrgKit } from '@/lib/agent-loader';
import type { ClaimedJob, JobOutcome } from '@/lib/worker/scheduler';

const POLL_MS = 5_000;
// The router needs at least one skill to pick a team; most Marcus tasks name none of the gate's keywords.
const FALLBACK_SKILLS = ['quality_review'];
const MAX_PARTS = 4;
// Recovery after a crash only happens once the 10-minute lease has lapsed, so the internal EAR rows outlive the usual 30 s window.
const ADMISSION_WINDOW_MS = 30 * 60_000;
const TERMINAL: Record<string, string> = { SUCCEEDED: 'done', FAILED: 'failed', BLOCKED_POLICY: 'blocked', BLOCKED_COST: 'blocked', CANCELLED: 'cancelled' };
const LEDGER_STATUS = { done: 'EXECUTED', failed: 'FAILED', blocked: 'DENIED', cancelled: 'VALIDATED' } as const;

type Job = Awaited<ReturnType<typeof loadJob>>;
const loadJob = (job: ClaimedJob) => prisma.agentJob.findFirst({ where: { id: job.id, userId: job.userId, jobKey: { startsWith: 'marcus:' } } });

/** Move the job out of `from` (and release the lease) only if nothing, such as a freeze, changed it meanwhile. */
async function finish(job: ClaimedJob, workerId: string, from: string, to: 'done' | 'failed' | 'blocked' | 'cancelled', reason: string | null): Promise<JobOutcome> {
  const won = await prisma.agentJob.updateMany({
    where: { id: job.id, userId: job.userId, leaseOwner: workerId, lastStatus: from },
    data: { lastStatus: to, lastError: reason, lastRunAt: new Date(), leaseUntil: null, leaseOwner: null, nextRunAt: MARCUS_NEVER_RUN, ...(to === 'blocked' ? {} : { capabilityRequestEnc: null }) }, // a blocked task keeps its text so it can be resumed
  });
  if (won.count !== 1) return 'SKIPPED';
  await recordAction({
    userId: job.userId, initiator: 'system', action: `capability_marcus_task_${to}`, permissionClass: 'C', status: LEDGER_STATUS[to],
    errorCode: reason, correlationId: `marcus-task:${job.id}`,
  });
  return to === 'failed' ? 'FAILED' : 'OK';
}

async function admit(job: ClaimedJob, workerId: string, row: NonNullable<Job>): Promise<JobOutcome> {
  const userId = job.userId;
  let content: { title: string; goal: string; deadline: string | null; directorate?: string | null; subsidiary?: string | null; targets?: string[] };
  try {
    content = JSON.parse(decryptKey(row.capabilityRequestEnc ?? ''));
    const hash = createHash('sha256').update(canonicalJson({ title: content.title, goal: content.goal, deadline: content.deadline })).digest('hex');
    if (hash !== row.capabilityRequestHash) return finish(job, workerId, 'received', 'failed', 'content_changed');
  } catch {
    return finish(job, workerId, 'received', 'failed', 'content_unreadable');
  }

  // Nothing is consumed until the model route and budget are known to allow the work, so a blocked task can be resumed.
  if (!analysisRoute() || (await budgetState(userId)).state === 'hard') return finish(job, workerId, 'received', 'blocked', 'model_or_budget_unavailable');

  // Skills come from the request's own words; the subsidiary line and target directorate steer the team but add no skills.
  const text = `${content.title}: ${content.goal}`;
  const scope = { subsidiary: content.subsidiary ?? null, targets: content.targets ?? [] };
  const objective = `${subsidiaryContext(scope)}${text}`.slice(0, 300);
  const skills = extractRequiredSkills(text);
  const directorate = matchDirectorate(content.directorate, [...new Set((await getOrgKit()).agents.map((a) => a.directorate))]);
  // Split by department: each analysis uses at most 5 specialists, so skills a full team could not cover go to the next one.
  const parts: ReturnType<typeof buildAuthorizationRequest>[] = [];
  let remaining = skills.length ? skills : FALLBACK_SKILLS;
  while (remaining.length) {
    const ear = buildAuthorizationRequest(objective, remaining, { maxAgents: 5, ...(directorate ? { targetDirectorate: directorate } : {}) });
    ear.execution_scope = 'internal_analysis';
    // A gap with room left in the team (or no progress) means nobody has that skill, not that the team was full.
    if (!ear.lead_agent || (ear.capability_gaps.length && (ear.team_size < 5 || ear.capability_gaps.length >= remaining.length))) return finish(job, workerId, 'received', 'blocked', 'no_specialist_available');
    remaining = ear.capability_gaps;
    ear.capability_gaps = []; // the leftover skills go to the next part; the EAR gate only admits a part with no gaps
    ear.required_skills = ear.required_skills.filter((k) => !remaining.includes(k));
    parts.push(ear);
    if (remaining.length && parts.length >= MAX_PARTS) return finish(job, workerId, 'received', 'blocked', 'too_many_departments');
  }

  // Single use: the Marcus approval is consumed and every part's EAR row is created in one transaction, so a crash
  // cannot leave a consumed approval with nothing recorded. A retry after a crash finds those rows and adopts them.
  const prior = await prisma.approvalRequest.count({ where: { userId, kind: 'ear', correlationId: { startsWith: `${row.jobKey}#` } } });
  let earIds: string[] = [];
  if (!prior) {
    try {
      earIds = await prisma.$transaction(async (tx) => {
        const used = await tx.approvalRequest.updateMany({
          where: { id: row.capabilityApprovalId ?? '', userId, status: 'APPROVED', executedAt: null },
          data: { status: 'EXECUTED', executedAt: new Date() },
        });
        if (used.count !== 1) throw new Error('approval_unavailable');
        const now = new Date();
        const ids: string[] = [];
        for (const [i, ear] of parts.entries()) {
          const params = JSON.parse(JSON.stringify(ear));
          ids.push((await tx.approvalRequest.create({
            data: {
              userId, kind: 'ear', tool: null, params, contentHash: approvalContentHash({ kind: 'ear', tool: null, params }),
              summary: `Marcus task: ${content.title}${parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : ''}`.slice(0, 200), permissionClass: 'C', status: 'EXECUTING',
              correlationId: `${row.jobKey}#${i}`, persona: 'WHINK', createdAt: now, decidedAt: now, expiresAt: new Date(now.getTime() + ADMISSION_WINDOW_MS),
            },
          })).id);
        }
        return ids;
      });
    } catch (e) {
      return finish(job, workerId, 'received', 'failed', e instanceof Error && e.message === 'approval_unavailable' ? 'approval_unavailable' : 'admission_failed');
    }
  } else {
    earIds = (await prisma.approvalRequest.findMany({ where: { userId, kind: 'ear', correlationId: { startsWith: `${row.jobKey}#` } }, select: { id: true, correlationId: true } }))
      .sort((x, y) => Number(x.correlationId?.split('#')[1]) - Number(y.correlationId?.split('#')[1])).map((r) => r.id);
  }

  const executionIds: string[] = [];
  try {
    for (const earId of earIds) {
      // Already queued by a run that crashed before moving the job on: adopt it, never queue a second one.
      const existing = await prisma.agentExecution.findFirst({ where: { approvalId: earId, userId }, select: { id: true } });
      const id = existing?.id ?? (await enqueueApprovedEar(userId, earId)).executionId;
      await prisma.sealedScope.upsert({ where: { kind_refId: { kind: 'EXECUTION', refId: id } }, create: { userId, kind: 'EXECUTION', refId: id }, update: {} });
      executionIds.push(id);
    }
  } catch {
    for (const id of executionIds) await cancelExecution(userId, id);
    return finish(job, workerId, 'received', 'failed', 'admission_failed');
  }
  const executionId = executionIds.join(',');
  const earApprovalId = earIds.join(',');

  const moved = await prisma.agentJob.updateMany({
    where: { id: job.id, userId, leaseOwner: workerId, lastStatus: 'received' },
    data: { lastStatus: 'in_progress', capabilityReceiptId: executionId, capabilityRequestEnc: null, lastRunAt: new Date(), leaseUntil: null, leaseOwner: null, nextRunAt: new Date(Date.now() + POLL_MS) },
  });
  if (moved.count !== 1) { for (const id of executionIds) await cancelExecution(userId, id); return 'SKIPPED'; } // frozen between admission and now
  await recordAction({
    userId, initiator: 'system', action: 'capability_marcus_task_started', permissionClass: 'C', status: 'VALIDATED',
    correlationId: `marcus-task:${job.id}`, inputSummary: `execution=${executionId} earApproval=${earApprovalId} marcusApproval=${row.capabilityApprovalId} directorate=${directorate ?? '-'} subsidiary=${scope.subsidiary ?? '-'} targets=${scope.targets.join(',') || '-'}`,
  });
  return 'OK';
}

async function poll(job: ClaimedJob, workerId: string, row: NonNullable<Job>): Promise<JobOutcome> {
  const ids = row.capabilityReceiptId?.split(',') ?? [];
  const executions = ids.length ? await prisma.agentExecution.findMany({ where: { id: { in: ids }, userId: job.userId } }) : [];
  if (!executions.length || executions.length !== ids.length) return finish(job, workerId, 'in_progress', 'failed', 'execution_missing');
  // Join: the task ends only when every part has; it is done only if every part is, otherwise the first failing part decides.
  if (executions.every((e) => TERMINAL[e.status])) {
    const bad = executions.find((e) => TERMINAL[e.status] !== 'done');
    return bad ? finish(job, workerId, 'in_progress', TERMINAL[bad.status] as 'failed' | 'blocked' | 'cancelled', bad.reason ?? bad.status.toLowerCase()) : finish(job, workerId, 'in_progress', 'done', null);
  }
  await prisma.agentJob.updateMany({
    where: { id: job.id, userId: job.userId, leaseOwner: workerId },
    data: { leaseUntil: null, leaseOwner: null, nextRunAt: new Date(Date.now() + POLL_MS) },
  });
  return 'OK';
}

export async function runMarcusJob(job: ClaimedJob, workerId: string, _now = new Date()): Promise<JobOutcome> {
  const row = await loadJob(job);
  const park = () => prisma.agentJob.updateMany({ where: { id: job.id, userId: job.userId, leaseOwner: workerId }, data: { leaseUntil: null, leaseOwner: null, nextRunAt: MARCUS_NEVER_RUN } });
  if (!row) { await park(); return 'SKIPPED'; }
  if (row.lastStatus === 'received') return admit(job, workerId, row);
  if (row.lastStatus === 'in_progress') return poll(job, workerId, row);
  await park(); // frozen, waiting for reconfirmation, blocked or finished: nothing to do until its status changes
  return 'SKIPPED';
}

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
import { APPROVAL_TTL_MS } from '@/lib/approvals';
import { budgetState } from '@/lib/budget';
import { analysisRoute, cancelExecution, enqueueApprovedEar } from '@/lib/worker/ear-execution';
import { MARCUS_NEVER_RUN } from '@/lib/marcus/freeze';
import { matchDirectorate, subsidiaryContext } from '@/lib/marcus/routing';
import { getOrgKit } from '@/lib/agent-loader';
import type { ClaimedJob, JobOutcome } from '@/lib/worker/scheduler';

const POLL_MS = 5_000;
// The router needs at least one skill to pick a team; most Marcus tasks name none of the gate's keywords.
const FALLBACK_SKILLS = ['quality_review'];
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
  const ear = buildAuthorizationRequest(objective, skills.length ? skills : FALLBACK_SKILLS, { maxAgents: 5, ...(directorate ? { targetDirectorate: directorate } : {}) });
  ear.execution_scope = 'internal_analysis';
  if (!ear.lead_agent || ear.capability_gaps.length) {
    // A full team with skills left over means the request spans more domains than one analysis may use; split it.
    return finish(job, workerId, 'received', 'blocked', ear.team_size >= 5 && ear.lead_agent ? 'too_many_departments' : 'no_specialist_available');
  }

  // Single use: only one caller can flip the Marcus approval to EXECUTED.
  const used = await prisma.approvalRequest.updateMany({
    where: { id: row.capabilityApprovalId ?? '', userId, status: 'APPROVED', executedAt: null },
    data: { status: 'EXECUTED', executedAt: new Date() },
  });
  if (used.count !== 1) return finish(job, workerId, 'received', 'failed', 'approval_unavailable');

  let executionId: string;
  let earApprovalId: string;
  try {
    const now = new Date();
    const params = JSON.parse(JSON.stringify(ear));
    const earRow = await prisma.approvalRequest.create({
      data: {
        userId, kind: 'ear', tool: null, params, contentHash: approvalContentHash({ kind: 'ear', tool: null, params }),
        summary: `Marcus task: ${content.title}`.slice(0, 200), permissionClass: 'C', status: 'EXECUTING', correlationId: row.jobKey,
        persona: 'WHINK', createdAt: now, decidedAt: now, expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
      },
    });
    earApprovalId = earRow.id;
    executionId = (await enqueueApprovedEar(userId, earRow.id)).executionId;
    await prisma.sealedScope.create({ data: { userId, kind: 'EXECUTION', refId: executionId } });
  } catch {
    return finish(job, workerId, 'received', 'failed', 'admission_failed');
  }

  const moved = await prisma.agentJob.updateMany({
    where: { id: job.id, userId, leaseOwner: workerId, lastStatus: 'received' },
    data: { lastStatus: 'in_progress', capabilityReceiptId: executionId, capabilityRequestEnc: null, lastRunAt: new Date(), leaseUntil: null, leaseOwner: null, nextRunAt: new Date(Date.now() + POLL_MS) },
  });
  if (moved.count !== 1) { await cancelExecution(userId, executionId); return 'SKIPPED'; } // frozen between admission and now
  await recordAction({
    userId, initiator: 'system', action: 'capability_marcus_task_started', permissionClass: 'C', status: 'VALIDATED',
    correlationId: `marcus-task:${job.id}`, inputSummary: `execution=${executionId} earApproval=${earApprovalId} marcusApproval=${row.capabilityApprovalId} directorate=${directorate ?? '-'} subsidiary=${scope.subsidiary ?? '-'} targets=${scope.targets.join(',') || '-'}`,
  });
  return 'OK';
}

async function poll(job: ClaimedJob, workerId: string, row: NonNullable<Job>): Promise<JobOutcome> {
  const execution = row.capabilityReceiptId ? await prisma.agentExecution.findFirst({ where: { id: row.capabilityReceiptId, userId: job.userId } }) : null;
  if (!execution) return finish(job, workerId, 'in_progress', 'failed', 'execution_missing');
  const to = TERMINAL[execution.status];
  if (to) return finish(job, workerId, 'in_progress', to as 'done' | 'failed' | 'blocked' | 'cancelled', to === 'done' ? null : execution.reason ?? execution.status.toLowerCase());
  await prisma.agentJob.updateMany({
    where: { id: job.id, userId: job.userId, leaseOwner: workerId },
    data: { leaseUntil: null, leaseOwner: null, nextRunAt: new Date(Date.now() + POLL_MS) },
  });
  return 'OK';
}

export async function runMarcusJob(job: ClaimedJob, workerId: string, _now = new Date()): Promise<JobOutcome> {
  const row = await loadJob(job);
  const park = () => prisma.agentJob.updateMany({ where: { id: job.id, userId: job.userId, leaseOwner: workerId }, data: { leaseUntil: null, leaseOwner: null, nextRunAt: MARCUS_NEVER_RUN } });
  if (!row || row.jobKey.endsWith('__freeze__')) { await park(); return 'SKIPPED'; }
  if (row.lastStatus === 'received') return admit(job, workerId, row);
  if (row.lastStatus === 'in_progress') return poll(job, workerId, row);
  await park(); // frozen, waiting for reconfirmation, blocked or finished: nothing to do until its status changes
  return 'SKIPPED';
}

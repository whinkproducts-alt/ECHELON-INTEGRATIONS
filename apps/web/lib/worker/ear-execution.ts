/** M1: approved, local, tool-free analysis on the existing AgentJob queue.
 * Approval admission is NOT completion. No registry writes, ambient memory or paid calls.
 */
import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';
import { checkApprovedAction, checkQueuedEar } from '@/lib/permission-engine';
import { getOrgKit, type OrgAgent } from '@/lib/agent-loader';
import { classifyProtected } from '@/lib/protected-actions';
import { buildDispatchMessage } from '@/lib/approval-handler';
import { buildMessages, parseAgentReply } from '@/lib/swarm/agent-call';
import { chatOnce, isNativeOllamaModel, nativeOllamaUrl, verifyLocalAnalysisModel } from '@/lib/model-router';
import { isLoopbackUrl } from '@/lib/local-only';
import { budgetState } from '@/lib/budget';
import { recordUsageStrict } from '@/lib/usage';
import type { ExecutionAuthorizationRequest } from '@whink/org-kit';
import type { ClaimedJob, JobOutcome } from './scheduler';
import type { AgentExecution, Prisma } from '@prisma/client';

const TERMINAL = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'BLOCKED_POLICY', 'BLOCKED_COST'];
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 120_000; // strictly below the existing 10-minute job lease

export function admittedAgents(ear: ExecutionAuthorizationRequest, agents: OrgAgent[]): OrgAgent[] {
  if (ear.execution_scope !== 'internal_analysis' || !ear.objective?.trim()) throw new Error('Explicit internal-analysis scope required; request a new approval');
  if (classifyProtected({ toolName: 'ear_objective', description: ear.objective }).protected) throw new Error('Protected objective is outside internal-analysis scope');
  const names = [ear.lead_agent, ...ear.supporting_agents];
  if (!ear.lead_agent || names.length > 5 || new Set(names).size !== names.length || ear.team_size !== names.length || ear.capability_gaps.length) throw new Error('Approved team is incomplete or ambiguous');
  return names.map((name) => {
    const matches = agents.filter((a) => a.name === name);
    const a = matches[0];
    if (matches.length !== 1 || ['suspended', 'retired'].includes(a.state) ||
        !a.permissions.includes('draft') || !a.skills.some((s) => ear.required_skills.includes(s)) ||
        /\b(marcus vale|kill team|founder.private|sealed)\b/i.test(`${a.agent_id} ${a.name} ${a.team} ${a.directorate} ${a.data_access.join(' ')}`.replace(/[_-]/g, ' '))) throw new Error('Agent not eligible for ordinary analysis');
    return a;
  });
}

/** No model default changes and no cloud route. Unknown cost/endpoint fails closed. */
export function analysisRoute(env: Record<string, string | undefined> = process.env): { model: string; baseUrl: string } | null {
  const model = env.SWARM_MODEL?.trim() || env.DEFAULT_MODEL?.trim();
  const baseUrl = env.OPENAI_COMPATIBLE_BASE_URL || 'http://localhost:11434/v1';
  if (!model || /^(claude|gemini)/i.test(model) || /(^|[:/.-])cloud($|[:/.-])/i.test(model) || !isLoopbackUrl(baseUrl)) return null;
  const ollama = env.OLLAMA_URL || 'http://localhost:11434';
  if (!isLoopbackUrl(ollama) || new URL(baseUrl).port !== new URL(ollama).port || new URL(baseUrl).pathname.replace(/\/$/, '') !== '/v1') return null;
  // Native Ollama has a separate endpoint; validate the transport the router will actually use.
  if (isNativeOllamaModel(model, baseUrl) && !isLoopbackUrl(nativeOllamaUrl() ?? '')) return null;
  return { model, baseUrl };
}

export async function enqueueApprovedEar(userId: string, approvalId: string, now = new Date()) {
  const row = await prisma.approvalRequest.findFirst({ where: { id: approvalId, userId } });
  if (!row || !(await checkApprovedAction(userId, approvalId, 'ear', row.contentHash)).allowed || row.expiresAt <= now) throw new Error('Valid unexpired approval required');
  const ear = row.params as unknown as ExecutionAuthorizationRequest;
  const agents = admittedAgents(ear, (await getOrgKit()).agents);
  return prisma.$transaction(async (tx) => {
    const execution = await tx.agentExecution.create({ data: { userId, approvalId, contentHash: row.contentHash, agentIds: agents.map((a) => a.agent_id) } });
    const receipt = { executionId: execution.id, status: 'QUEUED', scope: 'internal_analysis', message: buildDispatchMessage(ear, row.persona), statusUrl: `/api/executions/${execution.id}` };
    const won = await tx.approvalRequest.updateMany({ where: { id: approvalId, userId, status: 'EXECUTING', contentHash: row.contentHash, expiresAt: { gt: now } }, data: { status: 'EXECUTED', executedAt: now, result: { success: true, data: receipt } } });
    if (won.count !== 1) throw new Error('Approval no longer available');
    await tx.agentJob.create({ data: { userId, jobKey: `ear:${execution.id}`, nextRunAt: now } });
    await recordAction({ userId, action: 'ear_execution_queued', permissionClass: 'C', status: 'VALIDATED', correlationId: row.correlationId, validationResult: JSON.stringify({ approvalId, executionId: execution.id, state: 'QUEUED' }) }, tx);
    await recordAction({ userId, action: 'approval_executed', permissionClass: 'C', status: 'VALIDATED', correlationId: row.correlationId, outputSummary: 'Approval consumed for queue admission only', validationResult: JSON.stringify({ approvalId, executionId: execution.id }), confirmationMethod: 'user_confirmed' }, tx);
    return receipt;
  });
}

/** Decision TTL limits admission, not scheduled start. Scope/hash remain locked on resumption. */
async function approvedInput(execution: AgentExecution) {
  const row = await prisma.approvalRequest.findFirst({ where: { id: execution.approvalId, userId: execution.userId } });
  if (!row || !(await checkQueuedEar(execution.userId, execution.approvalId, execution.contentHash)).allowed) throw new Error('BLOCKED_POLICY');
  const ear = row.params as unknown as ExecutionAuthorizationRequest;
  let agents: OrgAgent[];
  try { agents = admittedAgents(ear, (await getOrgKit()).agents); } catch { throw new Error('BLOCKED_POLICY'); }
  if (JSON.stringify(agents.map((a) => a.agent_id)) !== JSON.stringify(execution.agentIds)) throw new Error('BLOCKED_POLICY');
  return { row, ear, agents };
}

/** Lease fencing, state CAS and audit commit together. Cancellation wins over late results. */
async function move(job: ClaimedJob, workerId: string, execution: AgentExecution, state: string, patch: Prisma.AgentExecutionUpdateManyMutationInput = {}) {
  return prisma.$transaction(async (tx) => {
    const held = await tx.agentJob.updateMany({ where: { id: job.id, userId: job.userId, leaseOwner: workerId, leaseUntil: job.leaseUntil, AND: { leaseUntil: { gt: new Date() } } }, data: { lastRunAt: new Date() } });
    if (held.count !== 1) return false;
    const won = await tx.agentExecution.updateMany({ where: { id: execution.id, userId: job.userId, status: execution.status, attempts: execution.attempts, claimToken: execution.claimToken }, data: { ...patch, status: state } });
    if (won.count !== 1) return false;
    await recordAction({ userId: job.userId, action: 'ear_execution_state', permissionClass: 'C', status: state === 'SUCCEEDED' ? 'EXECUTED' : state.startsWith('BLOCKED') ? 'DENIED' : state === 'FAILED' ? 'FAILED' : 'VALIDATED', correlationId: execution.approvalId, validationResult: JSON.stringify({ executionId: execution.id, approvalId: execution.approvalId, state, attempt: execution.attempts }) }, tx);
    return true;
  });
}

export async function cancelExecution(userId: string, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Match executor lock order: queue row, then execution row.
    await tx.agentJob.updateMany({ where: { userId, jobKey: `ear:${id}` }, data: { lastRunAt: new Date() } });
    const won = await tx.agentExecution.updateMany({ where: { id, userId, status: { notIn: TERMINAL } }, data: { status: 'CANCELLED', reason: 'owner_cancelled' } });
    if (!won.count) return false;
    await tx.agentJob.updateMany({ where: { userId, jobKey: `ear:${id}` }, data: { lastStatus: 'CANCELLED', leaseUntil: null, leaseOwner: null } });
    await recordAction({ userId, action: 'ear_execution_cancelled', permissionClass: 'C', status: 'VALIDATED', correlationId: id, validationResult: JSON.stringify({ executionId: id, state: 'CANCELLED' }) }, tx);
    return true;
  });
}

/** Reuses scheduler claims. Only idempotent internal inference may retry, at most three attempts. */
export async function runEarJob(job: ClaimedJob, workerId: string, _now = new Date()): Promise<JobOutcome> {
  if (!job.leaseUntil) return 'SKIPPED';
  let execution = await prisma.agentExecution.findFirst({ where: { id: job.jobKey.slice(4), userId: job.userId } });
  if (!execution) return 'SKIPPED';
  const executionId = execution.id;
  const park = async (state: string, retry = false) => {
    await prisma.agentJob.updateMany({ where: { id: job.id, userId: job.userId, leaseOwner: workerId, leaseUntil: job.leaseUntil }, data: { lastStatus: state, leaseUntil: null, leaseOwner: null, nextRunAt: new Date(Date.now() + (retry ? 1000 : 86_400_000)) } });
  };
  if (TERMINAL.includes(execution.status)) { await park(execution.status); return 'SKIPPED'; }
  let state = 'FAILED';
  const token = `${workerId}:${job.leaseUntil.toISOString()}`;
  if (execution.claimToken === token && ['CLAIMED', 'RUNNING'].includes(execution.status)) return 'SKIPPED';
  try {
    if (execution.attempts >= MAX_ATTEMPTS) throw new Error('FAILED');
    if (!(await move(job, workerId, execution, 'CLAIMED', { attempts: { increment: 1 }, claimToken: token }))) return 'SKIPPED';
    execution = { ...execution, status: 'CLAIMED', attempts: execution.attempts + 1, claimToken: token };
    const { ear, agents } = await approvedInput(execution);
    const route = analysisRoute();
    if (!route || (await budgetState(job.userId)).state === 'hard') throw new Error('BLOCKED_COST');
    if (!(await move(job, workerId, execution, 'RUNNING'))) return 'SKIPPED';
    execution = { ...execution, status: 'RUNNING' };
    const outputs: Array<{ agentId: string; result: string }> = [];
    const attemptDeadline = AbortSignal.timeout(5 * 60_000); // total team work < 10-minute lease
    for (const agent of agents) {
      // Recheck authority and cancellation before every inference boundary.
      await approvedInput(execution);
      if (!(await move(job, workerId, execution, 'RUNNING'))) return 'SKIPPED';
      const liveRoute = analysisRoute();
      if (!liveRoute || JSON.stringify(liveRoute) !== JSON.stringify(route) || (await budgetState(job.userId)).state === 'hard') throw new Error('BLOCKED_COST');
      if (!(await verifyLocalAnalysisModel(route.model, route.baseUrl))) throw new Error('BLOCKED_COST');
      const task = { lane: agent.agent_id, role: 'worker' as const, title: 'Approved internal analysis', objective: ear.objective, deliverable: 'Internal analysis or draft only; identify unsupported actions as blockers.', requiredSkills: ear.required_skills, covers: [], dependsOn: [], estimatedCalls: 1, agentId: agent.agent_id, agentName: agent.name, fit: 'matched' as const };
      const messages = buildMessages({ task, agent, deps: outputs.map((o) => ({ lane: o.agentId, result: o.result })), failedDeps: [], learnings: [] });
      const cancelled = new AbortController();
      const poll = setInterval(() => {
        void prisma.agentExecution.findFirst({ where: { id: executionId, userId: job.userId, status: 'RUNNING', claimToken: token } })
          .then((live) => { if (!live) cancelled.abort(); }).catch(() => cancelled.abort());
      }, 500);
      let text = '';
      try {
        text = await chatOnce({ ...route, messages, maxTokens: 1000, temperature: 0.2, signal: AbortSignal.any([cancelled.signal, attemptDeadline, AbortSignal.timeout(TIMEOUT_MS)]) });
      } finally {
        clearInterval(poll);
        // Estimates, including a conservative output reservation when a call failed without usage.
        try {
          await recordUsageStrict({ userId: job.userId, provider: 'local-analysis', model: route.model, tokensIn: Math.ceil(messages.map((m) => m.content).join('').length / 4), tokensOut: text ? Math.ceil(text.length / 4) : 1000, kind: 'other' });
        } catch { throw new Error('BLOCKED_COST'); }
      }
      const parsed = parseAgentReply(text, task);
      if (parsed.securityEvents.length) throw new Error('BLOCKED_POLICY');
      outputs.push({ agentId: agent.agent_id, result: parsed.output.result });
    }
    await approvedInput(execution);
    if (!(await move(job, workerId, execution, 'SUCCEEDED', { output: { scope: 'internal_analysis', agents: outputs, model: route.model }, reason: null }))) return 'SKIPPED';
    await park('SUCCEEDED');
    return 'OK';
  } catch (e) {
    const reason = (e as Error).message;
    state = reason === 'BLOCKED_POLICY' || reason === 'BLOCKED_COST' ? reason : execution.attempts < MAX_ATTEMPTS ? 'RETRY_SCHEDULED' : 'FAILED';
    if (await move(job, workerId, execution, state, { reason: state === 'RETRY_SCHEDULED' ? 'analysis_attempt_failed' : state })) await park(state, state === 'RETRY_SCHEDULED');
    return 'FAILED';
  }
}

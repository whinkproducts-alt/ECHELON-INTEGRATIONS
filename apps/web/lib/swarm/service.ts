/**
 * Swarm service used by the routes. Every function takes the session userId and scopes every query by it.
 * Plan -> explicit Start -> engine. Team size is pre-approved by the word "swarm"; schedule and budget are not,
 * so Start is a separate, ledgered click and refuses past the hard budget limit.
 */
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { runGuarded } from '@/lib/guarded-action';
import { writeLedger } from '@/lib/ledger';
import { logSecurityEvent } from '@/lib/permission-engine';
import { budgetState, decideBudget, type BudgetStateName } from '@/lib/budget';
import { scanUserInput } from '@/lib/content-isolation';
import { assertOwnedProject, hasProjectId } from '@/lib/project-access';
import { isSubsidiaryId } from '@/lib/subsidiaries';
import { getOrgKit } from '@/lib/agent-loader';
import { swarmConfig } from './config';
import { decomposeInitiative } from './planner';
import { normalizePackages, buildTaskSpecs, roleCounts } from './plan';
import { assignAgents } from './assign';
import { estimateRun, type SwarmEstimate } from './estimate';
import { runSwarm } from './engine';
import type { AssignedTask } from './types';

export const PlanInputSchema = z.object({
  initiative: z.string().trim().min(1).max(4000),
  projectId: z.string().min(1).max(64).optional(),
  subsidiary: z.string().min(1).max(40).optional(),
  minAgents: z.number().int().min(50).max(120).optional(),
}).strict();
export type PlanInput = z.infer<typeof PlanInputSchema>;

export interface BudgetFlag {
  state: BudgetStateName;
  projectedState: BudgetStateName;
  /** amber when the estimate pushes past the soft limit, red past the hard limit. */
  flag: 'none' | 'amber' | 'red';
  used: number;
  limit: number | null;
  estimatedTokens: number;
  /** Remaining estimated tokens of this user's other PLANNED/RUNNING runs, counted in the projection. */
  committedTokens: number;
}

/**
 * Tokens other live runs of this user may still spend: PLANNED runs their whole estimate, RUNNING runs the
 * estimate minus what is already metered (that part is in usage already), FINALIZING runs nothing.
 */
export async function committedTokens(userId: string, excludeRunId?: string): Promise<number> {
  const rows = (await prisma.swarmRun.findMany({ where: { userId, status: { in: ['PLANNED', 'RUNNING'] } } })) as RunRow[];
  let sum = 0;
  for (const r of rows) {
    if (r.id === excludeRunId) continue;
    const est = (r.estimate as SwarmEstimate | null)?.tokens ?? 0;
    sum += r.status === 'PLANNED' ? est : Math.max(0, est - r.tokensUsed);
  }
  return sum;
}

export async function budgetFor(userId: string, estimatedTokens: number, excludeRunId?: string): Promise<BudgetFlag> {
  const b = await budgetState(userId);
  const committed = await committedTokens(userId, excludeRunId);
  const projectedState = decideBudget(b.used + committed + estimatedTokens, b.limit, b.softPct, b.hardPct);
  return { state: b.state, projectedState, flag: projectedState === 'hard' ? 'red' : projectedState === 'soft' ? 'amber' : 'none', used: b.used, limit: b.limit, estimatedTokens, committedTokens: committed };
}

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500 | 502; error: string; code?: string };

interface RunRow {
  id: string; userId: string; projectId: string | null; subsidiary: string | null; title: string; status: string;
  minAgents: number; agentCount: number; estimate: unknown; tokenCap: number; tokensUsed: number;
  cancelRequested: boolean; stopReason: string | null; result: string | null;
  startedAt: Date | null; finishedAt: Date | null; createdAt: Date;
}

function runView(r: RunRow) {
  return {
    id: r.id, title: r.title, status: r.status, agents: r.agentCount, projectId: r.projectId, subsidiary: r.subsidiary,
    estimate: r.estimate as SwarmEstimate, tokenCap: r.tokenCap, tokensUsed: r.tokensUsed, cancelRequested: r.cancelRequested,
    stopReason: r.stopReason, startedAt: r.startedAt, finishedAt: r.finishedAt, createdAt: r.createdAt,
  };
}

export async function createPlan(userId: string, input: PlanInput): Promise<ServiceResult<{ run: ReturnType<typeof runView>; budget: BudgetFlag; tasks: unknown[] }>> {
  if (!userId) throw new Error('swarm: userId is required');
  const cfg = swarmConfig();
  const minAgents = Math.min(Math.max(input.minAgents ?? cfg.defaultMinAgents, cfg.minAgents), cfg.maxAgents);

  let projectId: string | null = null;
  if (hasProjectId(input.projectId)) {
    projectId = await assertOwnedProject(userId, input.projectId);
    if (!projectId) return { ok: false, status: 404, error: 'Project not found' };
  }
  if (input.subsidiary !== undefined && !isSubsidiaryId(input.subsidiary)) return { ok: false, status: 400, error: 'Unknown subsidiary' };

  const pre = await budgetState(userId);
  if (pre.state === 'hard') return { ok: false, status: 409, error: 'Monthly token budget is at its hard limit', code: 'budget_hard_limit' };

  const runId = randomUUID();
  if (scanUserInput(input.initiative).suspicious) {
    // Not blocked: business text trips these patterns often. It stays wrapped data and cannot add tools.
    try { await logSecurityEvent(userId, 'swarm_initiative_injection_pattern', `run=${runId} (initiative stays untrusted data)`, runId); } catch { /* ledger down */ }
  }

  type Out = { ok: true; value: { run: ReturnType<typeof runView>; budget: BudgetFlag; tasks: unknown[] } } | { ok: false; status: 400 | 409 | 502; error: string; code?: string };
  const g = await runGuarded<Out>(
    { userId, capability: 'swarm_plan', permissionClass: 'A', action: 'swarm_planned', correlationId: runId, persona: 'WHINK', summary: `run=${runId} minAgents=${minAgents} initiativeChars=${input.initiative.length}` },
    async (): Promise<Out> => {
      const counts = roleCounts(minAgents);
      let packages;
      let plannerTokens = 0;
      let title: string;
      try {
        const d = await decomposeInitiative(userId, input.initiative, counts.worker);
        plannerTokens = d.tokensIn + d.tokensOut;
        title = d.title;
        packages = normalizePackages(d.packages, counts.worker);
      } catch {
        return { ok: false, status: 502, error: 'Planner unavailable or returned no usable plan' };
      }
      const kit = await getOrgKit();
      const specs = buildTaskSpecs(packages, counts);
      let assigned: AssignedTask[];
      try { assigned = assignAgents(specs, kit.agents); } catch { return { ok: false, status: 409, error: 'Not enough agents available' }; }
      const estimate = estimateRun(specs, plannerTokens);
      const budget = await budgetFor(userId, estimate.tokens);
      const tokenCap = Math.min(cfg.tokenCapPerRun, Math.ceil(estimate.tokens * cfg.tokenCapMultiplier));
      const run = await prisma.swarmRun.create({
        data: {
          id: runId, userId, projectId, subsidiary: input.subsidiary ?? null, title, initiative: input.initiative, status: 'PLANNED',
          minAgents, agentCount: assigned.length, estimate: estimate as object, tokenCap,
        },
      });
      await prisma.swarmTask.createMany({
        data: assigned.map((t) => ({
          runId, userId, lane: t.lane, role: t.role, agentId: t.agentId, fit: t.fit, title: t.title, objective: t.objective,
          deliverable: t.deliverable, requiredSkills: t.requiredSkills, covers: t.covers, dependsOn: t.dependsOn, estimatedCalls: t.estimatedCalls,
        })),
      });
      const tasks = assigned.map((t) => ({ lane: t.lane, role: t.role, agentId: t.agentId, agentName: t.agentName, fit: t.fit, title: t.title, covers: t.covers, dependsOn: t.dependsOn }));
      return { ok: true, value: { run: runView(run as RunRow), budget, tasks } };
    },
  );
  if (!g.ok) return { ok: false, status: g.status === 403 ? 403 : 500, error: g.error };
  if (!g.value.ok) return { ok: false, status: g.value.status, error: g.value.error, code: g.value.code };
  return { ok: true, value: g.value.value };
}

export async function startRun(userId: string, id: string): Promise<ServiceResult<{ run: ReturnType<typeof runView>; budget: BudgetFlag }>> {
  if (!userId) throw new Error('swarm: userId is required');
  const row = (await prisma.swarmRun.findFirst({ where: { id, userId } })) as RunRow | null;
  if (!row) return { ok: false, status: 404, error: 'Not found' };
  if (row.status !== 'PLANNED') return { ok: false, status: 409, error: 'Run is not in PLANNED state', code: 'not_planned' };
  const est = row.estimate as SwarmEstimate;
  const budget = await budgetFor(userId, est.tokens, id);
  if (budget.state === 'hard' || budget.projectedState === 'hard') {
    await writeLedger({
      userId, action: 'swarm_start_refused', tool: 'swarm_start', permissionClass: 'A', status: 'DENIED', initiator: 'user', persona: 'WHINK', correlationId: id,
      metadata: { reason: 'budget_hard_limit', estimatedTokens: est.tokens, used: budget.used, limit: budget.limit },
    });
    return { ok: false, status: 409, error: 'Refused: this run would pass the hard token budget limit', code: 'budget_hard_limit' };
  }
  const g = await runGuarded(
    { userId, capability: 'swarm_start', permissionClass: 'A', action: 'swarm_started', correlationId: id, persona: 'WHINK',
      summary: `explicit_start=1 agents=${row.agentCount} estTokens=${est.tokens} estCalls=${est.expectedCalls} etaSeconds=${est.etaSeconds} budget=${budget.flag}` },
    async () => {
      const moved = await prisma.swarmRun.updateMany({ where: { id, userId, status: 'PLANNED' }, data: { status: 'RUNNING', startedAt: new Date() } });
      if (moved.count !== 1) return 'conflict' as const;
      // Cap on concurrently running runs per user. Checked after the atomic move so racing starts cannot both slip past.
      const running = (await prisma.swarmRun.findMany({ where: { userId, status: 'RUNNING' } })) as RunRow[];
      if (running.length > swarmConfig().maxConcurrentRuns) {
        await prisma.swarmRun.updateMany({ where: { id, userId, status: 'RUNNING' }, data: { status: 'PLANNED', startedAt: null } });
        return 'limit' as const;
      }
      return 'started' as const;
    },
  );
  if (!g.ok) return { ok: false, status: g.status === 403 ? 403 : 500, error: g.error };
  if (g.value === 'limit') {
    await writeLedger({ userId, action: 'swarm_start_refused', tool: 'swarm_start', permissionClass: 'A', status: 'DENIED', initiator: 'user', persona: 'WHINK', correlationId: id, metadata: { reason: 'too_many_running', max: swarmConfig().maxConcurrentRuns } });
    return { ok: false, status: 409, error: 'Too many runs are already running. Wait for one to finish or cancel it.', code: 'too_many_running' };
  }
  if (g.value === 'conflict') return { ok: false, status: 409, error: 'Run was already started', code: 'not_planned' };
  void runSwarm(id, userId).catch(() => {});
  const fresh = (await prisma.swarmRun.findFirst({ where: { id, userId } })) as RunRow | null;
  return { ok: true, value: { run: runView((fresh ?? row) as RunRow), budget } };
}

export async function listRuns(userId: string) {
  if (!userId) throw new Error('swarm: userId is required');
  const rows = (await prisma.swarmRun.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 })) as RunRow[];
  return rows.map(runView);
}

export async function getRun(userId: string, id: string) {
  if (!userId) throw new Error('swarm: userId is required');
  const row = (await prisma.swarmRun.findFirst({ where: { id, userId } })) as RunRow | null;
  if (!row) return null;
  const tasks = (await prisma.swarmTask.findMany({ where: { runId: id, userId }, orderBy: { createdAt: 'asc' } })) as Array<{
    lane: string; role: string; agentId: string; fit: string; status: string; attempts: number; tokensIn: number; tokensOut: number; error: string | null; dependsOn: string[]; title: string;
  }>;
  const learnings = (await prisma.swarmLearning.findMany({ where: { runId: id, userId }, orderBy: { createdAt: 'desc' }, take: 100 })) as Array<{ lane: string; agentId: string; text: string; confidence: number; createdAt: Date }>;
  let names = new Map<string, string>();
  try { names = new Map((await getOrgKit()).agents.map((a) => [a.agent_id, a.name])); } catch { /* names are cosmetic */ }
  const counts: Record<string, number> = { PENDING: 0, RUNNING: 0, DONE: 0, FAILED: 0, SKIPPED: 0 };
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const est = row.estimate as SwarmEstimate;
  return {
    run: runView(row),
    counts,
    tasks: tasks.map((t) => ({ lane: t.lane, role: t.role, agentId: t.agentId, agentName: names.get(t.agentId) ?? null, fit: t.fit, title: t.title, status: t.status, attempts: t.attempts, tokens: t.tokensIn + t.tokensOut, error: t.error, dependsOn: t.dependsOn })),
    learnings: learnings.map((l) => ({ lane: l.lane, agentId: l.agentId, text: l.text, confidence: l.confidence, createdAt: l.createdAt })),
    tokens: { estimated: est.tokens, actual: row.tokensUsed, cap: row.tokenCap },
    // The report is model output derived from untrusted text: clients must render it as text, never HTML.
    result: row.status === 'DONE' ? row.result : null,
    resultUntrusted: true,
  };
}

export async function cancelRun(userId: string, id: string): Promise<ServiceResult<{ status: string }>> {
  if (!userId) throw new Error('swarm: userId is required');
  const row = (await prisma.swarmRun.findFirst({ where: { id, userId } })) as RunRow | null;
  if (!row) return { ok: false, status: 404, error: 'Not found' };
  const g = await runGuarded(
    { userId, capability: 'swarm_cancel', permissionClass: 'A', action: 'swarm_cancelled', correlationId: id, persona: 'WHINK', summary: `run=${id} from=${row.status}` },
    async () => {
      const planned = await prisma.swarmRun.updateMany({ where: { id, userId, status: 'PLANNED' }, data: { status: 'CANCELLED', cancelRequested: true, finishedAt: new Date(), stopReason: 'cancelled' } });
      if (planned.count === 1) return 'CANCELLED';
      const running = await prisma.swarmRun.updateMany({ where: { id, userId, status: 'RUNNING' }, data: { cancelRequested: true } });
      return running.count === 1 ? 'CANCELLING' : null;
    },
  );
  if (!g.ok) return { ok: false, status: g.status === 403 ? 403 : 500, error: g.error };
  if (!g.value) return { ok: false, status: 409, error: 'Run already finished', code: 'finished' };
  return { ok: true, value: { status: g.value } };
}

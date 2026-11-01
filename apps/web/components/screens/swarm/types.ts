// Response shapes of /api/swarm routes (lib/swarm/service.ts). All text is untrusted and rendered as text.
import type { HoloTone } from '@/components/ui/holo';

export type SwarmRole = 'lead' | 'integrator' | 'redteam' | 'reviewer' | 'worker';
export const ROLE_ORDER: readonly SwarmRole[] = ['lead', 'integrator', 'redteam', 'reviewer', 'worker'];
export const ROLE_META: Record<SwarmRole, { label: string; plural: string; tone: HoloTone; blurb: string }> = {
  lead: { label: 'Lead', plural: 'Leads', tone: 'accent', blurb: 'Sets direction and writes the final report' },
  integrator: { label: 'Integrator', plural: 'Integrators', tone: 'deep', blurb: 'Joins the lanes into one piece of work' },
  redteam: { label: 'Red team', plural: 'Red team', tone: 'ember', blurb: 'Attacks the plan and the results' },
  reviewer: { label: 'Reviewer', plural: 'Reviewers', tone: 'neutral', blurb: 'Checks lanes before they are accepted' },
  worker: { label: 'Worker', plural: 'Workers', tone: 'accent', blurb: 'Does one work package' },
};

export type RunStatus = 'PLANNED' | 'RUNNING' | 'FINALIZING' | 'DONE' | 'FAILED' | 'CANCELLED';
export const isLive = (s: string): boolean => s === 'RUNNING' || s === 'FINALIZING';

export interface Estimate {
  agents: number; workPackages: number; roles: Record<string, number>;
  expectedCalls: number; maxCalls: number; tokens: number; tokensIn: number; tokensOut: number;
  criticalPath: number; concurrency: number; etaSeconds: number; plannerTokens: number;
}

export interface RunView {
  id: string; title: string; status: RunStatus; agents: number; projectId: string | null; subsidiary: string | null;
  estimate: Estimate; tokenCap: number; tokensUsed: number; cancelRequested: boolean; stopReason: string | null;
  startedAt: string | null; finishedAt: string | null; createdAt: string;
}

export interface BudgetFlag {
  state: 'ok' | 'soft' | 'hard'; projectedState: 'ok' | 'soft' | 'hard'; flag: 'none' | 'amber' | 'red';
  used: number; limit: number | null; estimatedTokens: number;
}

export interface PlanTask { lane: string; role: SwarmRole; agentId: string; agentName: string | null; fit: 'matched' | 'generalist'; title: string; covers?: string[]; dependsOn?: string[] }
export interface PlanResponse { run: RunView; budget: BudgetFlag; tasks: PlanTask[] }

export type TaskStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
export interface RunTask extends PlanTask { status: TaskStatus; attempts: number; tokens: number; error: string | null }
export interface Learning { lane: string; agentId: string; text: string; confidence: number; createdAt: string }
export interface RunDetail {
  run: RunView; counts: Record<string, number>; tasks: RunTask[]; learnings: Learning[];
  tokens: { estimated: number; actual: number; cap: number }; result: string | null; resultUntrusted: boolean;
}

export interface ProjectOption { id: string; name: string; subsidiary: string | null }

export const fmtInt = (n: number): string => new Intl.NumberFormat('en-US').format(Math.round(n));
export const fmtCompact = (n: number): string => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export function fmtEta(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return `about ${m} min`;
  const h = Math.floor(m / 60);
  return `about ${h} h ${m % 60} min`;
}

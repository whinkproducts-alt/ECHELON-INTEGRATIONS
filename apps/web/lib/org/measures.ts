/**
 * Fixed measure codes. Each is one hard-coded ledger or task query, so a KPI can never read anything else.
 * Evidence is attributed only where rows carry the entity: swarm tasks by agentId, initiatives and ledger rows by the
 * persona code. Where an entity has no rows in the period the value is null ("no evidence"), never zero.
 */
import { prisma } from '@/lib/db';
import type { OrgNode } from '@/lib/org/graph';

export const MEASURE_CODES = [
  'task_completion_rate', 'rework_rate', 'approval_overrides', 'cost_per_task', 'viable_ideas', 'revenue_credit', 'training_completion',
] as const;
export type MeasureCode = (typeof MEASURE_CODES)[number];
/** Which way is good. Fixed per code, not editable. */
export const DIRECTION: Record<MeasureCode, 'higher' | 'lower'> = {
  task_completion_rate: 'higher', rework_rate: 'lower', approval_overrides: 'lower', cost_per_task: 'lower',
  viable_ideas: 'higher', revenue_credit: 'higher', training_completion: 'higher',
};
export interface Measured { value: number | null; evidence: number }
const none: Measured = { value: null, evidence: 0 };
const ratio = (n: number, d: number): Measured => (d === 0 ? none : { value: n / d, evidence: d });

/** Persona code used by Initiative.recipient and Action.persona, or null for entities that carry none. */
export function personaCode(n: OrgNode): string | null {
  return n.kind === 'persona' ? n.key.split('-')[0].toUpperCase() : null;
}

export async function measure(code: MeasureCode, userId: string, n: OrgNode, from: Date, to: Date): Promise<Measured> {
  const win = { gte: from, lt: to };
  const pc = personaCode(n);
  switch (code) {
    case 'task_completion_rate': {
      const [done, failed] = await Promise.all([
        n.kind === 'agent' ? prisma.swarmTask.count({ where: { userId, agentId: n.key, status: 'DONE', finishedAt: win } }) : 0,
        n.kind === 'agent' ? prisma.swarmTask.count({ where: { userId, agentId: n.key, status: 'FAILED', finishedAt: win } }) : 0,
      ]);
      const [idone, ifail] = pc ? await Promise.all([
        prisma.initiative.count({ where: { userId, recipient: pc, status: 'completed', updatedAt: win } }),
        prisma.initiative.count({ where: { userId, recipient: pc, status: 'failed', updatedAt: win } }),
      ]) : [0, 0];
      return ratio(done + idone, done + failed + idone + ifail);
    }
    case 'rework_rate': {
      if (n.kind !== 'agent') return none;
      const where = { userId, agentId: n.key, status: { in: ['DONE', 'FAILED'] }, finishedAt: win };
      const [total, redone] = await Promise.all([prisma.swarmTask.count({ where }), prisma.swarmTask.count({ where: { ...where, attempts: { gt: 1 } } })]);
      return ratio(redone, total);
    }
    case 'approval_overrides': {
      if (!pc || (pc !== 'WHINK' && pc !== 'MAMBA' && pc !== 'MARCUS')) return none;
      const where = { userId, persona: pc, createdAt: win };
      const [denied, executed] = await Promise.all([prisma.action.count({ where: { ...where, status: 'DENIED' } }), prisma.action.count({ where: { ...where, status: 'EXECUTED' } })]);
      return ratio(denied, denied + executed);
    }
    case 'cost_per_task': {
      if (n.kind !== 'agent') return none;
      const rows = await prisma.swarmTask.aggregate({ where: { userId, agentId: n.key, status: 'DONE', finishedAt: win }, _sum: { tokensIn: true, tokensOut: true }, _count: true });
      return rows._count === 0 ? none : { value: ((rows._sum.tokensIn ?? 0) + (rows._sum.tokensOut ?? 0)) / rows._count, evidence: rows._count };
    }
    case 'viable_ideas': {
      const c = await prisma.founderIdea.count({ where: { userId, authorKey: n.key, viableAt: win } });
      return { value: c, evidence: c };
    }
    case 'revenue_credit': {
      const contracts = await prisma.contract.findMany({ where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] }, valueAmount: { not: null }, updatedAt: win }, select: { valueAmount: true, projectId: true, sourcedByKey: true } });
      let total = 0; let touched = 0;
      for (const c of contracts) {
        const value = Number(c.valueAmount);
        const tasks = c.projectId ? await prisma.projectTask.findMany({ where: { projectId: c.projectId, assignee: { not: null } }, select: { assignee: true } }) : [];
        if (tasks.length > 0) {
          const mine = tasks.filter((t) => t.assignee === n.key).length;
          if (mine > 0) { total += value * (mine / tasks.length); touched++; }
        } else if (c.sourcedByKey === n.key) { total += value; touched++; }
      }
      return touched === 0 ? none : { value: total, evidence: touched };
    }
    case 'training_completion': {
      const where = { userId, entityKey: n.key, dueAt: win };
      const rows = await prisma.orgTraining.findMany({ where, select: { status: true, courseId: true } });
      const mandatory = new Set((await prisma.orgCourse.findMany({ where: { userId, mandatory: true, id: { in: rows.map((r) => r.courseId) } }, select: { id: true } })).map((c) => c.id));
      const m = rows.filter((r) => mandatory.has(r.courseId));
      return ratio(m.filter((r) => r.status === 'PASSED').length, m.length);
    }
  }
}

export function meets(code: MeasureCode, value: number | null, target: number): boolean | null {
  if (value === null) return null;
  return DIRECTION[code] === 'higher' ? value >= target : value <= target;
}

/** 0..1 attainment against the target, used for the promotion composite. */
export function attainment(code: MeasureCode, value: number, target: number): number {
  if (DIRECTION[code] === 'higher') return target <= 0 ? 1 : Math.min(1, value / target);
  return value <= target ? 1 : value <= 0 ? 1 : Math.min(1, target / value);
}


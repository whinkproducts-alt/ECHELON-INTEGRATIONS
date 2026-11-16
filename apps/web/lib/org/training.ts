/**
 * HR training. Agents do not change weights: "training" is vetted lessons plus a scenario test they must pass.
 * Ethics and compliance content comes from Victor and the compliance checker. Templates ship empty (NEEDS_VICTOR) and
 * are never assigned until the owner approves content AND sets a pass mark.
 */
import { prisma } from '@/lib/db';
import { writeLedger } from '@/lib/ledger';

export interface Scenario { id: string; prompt: string; mustMention: string[]; mustNotMention?: string[] }

export const TEMPLATES = [
  { code: 'ethics-core', title: 'Ethics', category: 'ethics', mandatory: true },
  { code: 'compliance-core', title: 'Compliance (privacy, anti-spam, licences)', category: 'compliance', mandatory: true },
  { code: 'protected-actions', title: 'Protected actions: money and proprietary information', category: 'mandatory', mandatory: true },
  { code: 'skills-core', title: 'Role skills refresher', category: 'skills', mandatory: false },
] as const;

export async function ensureTemplates(userId: string) {
  await prisma.orgCourse.createMany({ data: TEMPLATES.map((t) => ({ userId, ...t })), skipDuplicates: true });
}

/** Pure. Pass when the share of scenarios passed is at least passMark. Mention checks are case-insensitive substrings. */
export function scoreScenarios(scenarios: Scenario[], answers: Record<string, string>, passMark: number): { score: number; passed: boolean } {
  if (scenarios.length === 0) return { score: 0, passed: false };
  const ok = scenarios.filter((s) => {
    const a = (answers[s.id] ?? '').toLowerCase();
    return s.mustMention.every((m) => a.includes(m.toLowerCase())) && (s.mustNotMention ?? []).every((m) => !a.includes(m.toLowerCase()));
  }).length;
  const score = ok / scenarios.length;
  return { score, passed: score >= passMark };
}

/** Approve content: needs a body, at least one scenario, and an owner-set pass mark. */
export async function approveCourse(userId: string, code: string, c: { body: string; scenarios: Scenario[]; passMark: number; intervalDays: number }) {
  if (!c.body.trim() || c.scenarios.length === 0) return { ok: false as const, error: 'body and at least one scenario required' };
  if (!(c.passMark > 0 && c.passMark <= 1) || !Number.isInteger(c.intervalDays) || c.intervalDays < 1) return { ok: false as const, error: 'pass mark 0..1 and interval in days required' };
  const r = await prisma.orgCourse.updateMany({ where: { userId, code }, data: { body: c.body, scenarios: c.scenarios as never, passMark: c.passMark, intervalDays: c.intervalDays, contentStatus: 'APPROVED' } });
  if (!r.count) return { ok: false as const, error: 'unknown course' };
  await writeLedger({ userId, initiator: 'user', action: 'org_course_approved', permissionClass: 'A', status: 'EXECUTED', confirmationMethod: 'user_confirmed', metadata: { code } });
  return { ok: true as const };
}

/** Scheduler job body: assign every APPROVED course to every active entity that has no open assignment and was not passed within the interval. */
export async function runTrainingScheduler(userId: string, now = new Date()): Promise<{ assigned: number; overdue: number }> {
  const courses = await prisma.orgCourse.findMany({ where: { userId, contentStatus: 'APPROVED', intervalDays: { not: null } } });
  if (courses.length === 0) return { assigned: 0, overdue: 0 };
  const ents = await prisma.orgEntity.findMany({ where: { userId, status: 'active' }, select: { key: true } });
  let assigned = 0;
  for (const c of courses) {
    const rows = await prisma.orgTraining.findMany({ where: { userId, courseId: c.id }, select: { entityKey: true, status: true, passedAt: true, dueAt: true } });
    const by = new Map<string, typeof rows>();
    for (const r of rows) by.set(r.entityKey, [...(by.get(r.entityKey) ?? []), r]);
    const data = ents.filter((e) => {
      const mine = by.get(e.key) ?? [];
      if (mine.some((r) => r.status === 'ASSIGNED')) return false;
      const last = mine.filter((r) => r.passedAt).sort((a, b) => b.passedAt!.getTime() - a.passedAt!.getTime())[0];
      return !last || now.getTime() - last.passedAt!.getTime() >= (c.intervalDays! * 86_400_000);
    }).map((e) => ({ userId, entityKey: e.key, courseId: c.id, dueAt: new Date(now.getTime() + c.intervalDays! * 86_400_000) }));
    if (data.length) { await prisma.orgTraining.createMany({ data }); assigned += data.length; }
  }
  const overdue = await prisma.orgTraining.count({ where: { userId, status: 'ASSIGNED', dueAt: { lt: now }, courseId: { in: courses.filter((c) => c.mandatory).map((c) => c.id) } } });
  await writeLedger({ userId, initiator: 'system', action: 'org_training_scheduled', permissionClass: 'A', status: overdue ? 'UNVERIFIED' : 'EXECUTED', metadata: { assigned, overdueMandatory: overdue } });
  return { assigned, overdue };
}

export async function recordAttempt(userId: string, trainingId: string, answers: Record<string, string>, now = new Date()) {
  const t = await prisma.orgTraining.findFirst({ where: { id: trainingId, userId } });
  if (!t || t.status === 'PASSED') return { ok: false as const, error: 'not found or already passed' };
  const c = await prisma.orgCourse.findFirst({ where: { id: t.courseId, userId, contentStatus: 'APPROVED' } });
  if (!c || c.passMark === null) return { ok: false as const, error: 'course not approved' };
  const r = scoreScenarios((c.scenarios ?? []) as unknown as Scenario[], answers, c.passMark);
  await prisma.orgTraining.update({ where: { id: t.id }, data: { attempts: { increment: 1 }, score: r.score, status: r.passed ? 'PASSED' : 'ASSIGNED', passedAt: r.passed ? now : null } });
  await writeLedger({ userId, initiator: 'system', action: 'org_training_attempt', permissionClass: 'A', status: r.passed ? 'EXECUTED' : 'FAILED', metadata: { entityKey: t.entityKey, course: c.code, score: r.score } });
  return { ok: true as const, ...r };
}

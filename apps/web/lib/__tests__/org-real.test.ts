/** Lane E against a real isolated Postgres (opt in with M1_EXECUTION_DATABASE_URL). */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
import { prisma } from '@/lib/db';
import { seedOrg } from '@/lib/org/seed';
import { setKpi, setPolicy } from '@/lib/org/kpi';
import { runScoring } from '@/lib/org/scoring';
import { createProposal, decideProposal } from '@/lib/org/promotion';
import { approveCourse, ensureTemplates, recordAttempt, runTrainingScheduler } from '@/lib/org/training';
import { openReviews, submitView } from '@/lib/org/review';
import { markIdeaViable } from '@/lib/org/credit';

const enabled = !!process.env.M1_EXECUTION_DATABASE_URL;
let u = '', other = '';
const NOW = new Date('2026-11-16T12:00:00Z');

describe.skipIf(!enabled)('organisation real database', () => {
  beforeAll(async () => {
    if (process.env.M1_EXECUTION_DATABASE_URL !== process.env.DATABASE_URL || !/test/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error('Isolated test database required');
    u = (await prisma.user.create({ data: { email: `org-a-${randomUUID()}@example.test` } })).id;
    other = (await prisma.user.create({ data: { email: `org-b-${randomUUID()}@example.test` } })).id;
    await seedOrg(u);
  });
  afterAll(async () => {
    for (const id of [u, other]) {
      await Promise.all(['orgKpi', 'orgKpiScore', 'orgPromotion', 'orgReview', 'orgCourse', 'orgTraining', 'orgPolicy', 'orgChatMessage'].map((m) => (prisma as any)[m].deleteMany({ where: { userId: id } })));
      await prisma.swarmTask.deleteMany({ where: { userId: id } }); await prisma.swarmRun.deleteMany({ where: { userId: id } });
      await prisma.founderIdea.deleteMany({ where: { userId: id } });
      await prisma.action.deleteMany({ where: { userId: id } }); await prisma.hypothesis.deleteMany({ where: { userId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('seeds the org once, one manager each, and is idempotent', async () => {
    expect(await prisma.orgEntity.count({ where: { userId: u } })).toBeGreaterThan(400);
    await seedOrg(u);
    expect(await prisma.orgEntity.count({ where: { userId: u, key: 'victor-igboekwe' } })).toBe(1);
    expect(await prisma.orgEntity.count({ where: { userId: u, managerKey: null } })).toBe(1);
    expect(await prisma.orgEntity.count({ where: { userId: other } })).toBe(0); // tenant scoped
  });

  it('has no KPIs or promotion trigger by default, so nothing is scored or proposed', async () => {
    expect(await runScoring(u, NOW)).toEqual({ scored: 0, noEvidence: 0, proposals: 0 });
    expect(await prisma.orgPromotion.count({ where: { userId: u } })).toBe(0);
  });

  it('scores an agent from task rows, reports no evidence as null, and refuses self-edit', async () => {
    const agent = (await prisma.orgEntity.findFirst({ where: { userId: u, kind: 'agent' } }))!;
    const idle = (await prisma.orgEntity.findFirst({ where: { userId: u, kind: 'agent', key: { not: agent.key } } }))!;
    expect(await setKpi(u, agent.key, { entityKey: agent.key, measureCode: 'task_completion_rate', target: 0.5, weight: 1, periodDays: 30 })).toEqual({ ok: false, error: 'an entity cannot set its own KPI' });
    expect((await setKpi(u, null, { entityKey: agent.key, measureCode: 'task_completion_rate', target: 0.5, weight: 1, periodDays: 30 })).ok).toBe(true);
    expect((await setKpi(u, null, { entityKey: idle.key, measureCode: 'task_completion_rate', target: 0.5, weight: 1, periodDays: 30 })).ok).toBe(true);
    const run = await prisma.swarmRun.create({ data: { userId: u, title: 't', initiative: 'i', minAgents: 1, agentCount: 1, estimate: {}, tokenCap: 1 } });
    const t = new Date('2026-10-20T00:00:00Z');
    const mk = (lane: string, status: string) => ({ runId: run.id, userId: u, lane, role: 'worker', agentId: agent.key, fit: 'matched', title: 'x', objective: 'x', deliverable: 'x', status, finishedAt: t });
    await prisma.swarmTask.createMany({ data: [mk('l1', 'DONE'), mk('l2', 'DONE'), mk('l3', 'DONE'), mk('l4', 'FAILED')] });
    expect(await runScoring(u, NOW)).toMatchObject({ scored: 2, noEvidence: 1 });
    const s = await prisma.orgKpiScore.findFirst({ where: { userId: u, entityKey: agent.key } });
    expect(s).toMatchObject({ value: 0.75, meetsTarget: true, evidence: 4 });
    expect((await prisma.orgKpiScore.findFirst({ where: { userId: u, entityKey: idle.key } }))!.value).toBeNull();
    await runScoring(u, NOW); // idempotent
    expect(await prisma.orgKpiScore.count({ where: { userId: u, entityKey: agent.key } })).toBe(1);
  });

  it('proposes a promotion only after the owner sets threshold and periods', async () => {
    await setPolicy(u, { promotionThreshold: 0.5, periodsRequired: 1 });
    const r = await runScoring(u, NOW);
    expect(r.proposals).toBe(1);
    expect(await runScoring(u, NOW)).toMatchObject({ proposals: 0 }); // one open proposal at a time
    const p = (await prisma.orgPromotion.findFirst({ where: { userId: u } }))!;
    expect(p.requiredKeys).toHaveLength(2);
    expect((await decideProposal(u, p.id, p.requiredKeys[0], 'approve', 'f'.repeat(64))).ok).toBe(false); // wrong hash
    expect((await decideProposal(u, p.id, 'nobody', 'approve', p.contentHash)).ok).toBe(false); // not a required approver
    expect(await decideProposal(u, p.id, p.requiredKeys[0], 'approve', p.contentHash)).toEqual({ ok: true, status: 'PENDING' });
    expect((await decideProposal(u, p.id, p.requiredKeys[0], 'approve', p.contentHash)).ok).toBe(false); // once each
    expect(await decideProposal(u, p.id, p.requiredKeys[1], 'approve', p.contentHash)).toEqual({ ok: true, status: 'APPROVED' });
    expect((await decideProposal(other, p.id, p.requiredKeys[1], 'approve', p.contentHash)).ok).toBe(false); // other tenant
  });

  it('Marcus: founder alone; founder cannot be proposed', async () => {
    const r = await createProposal(u, { entityKey: 'marcus-vale', kind: 'promote', toRole: 'x' }, 'user');
    expect(r).toMatchObject({ ok: true, requiredKeys: ['victor-igboekwe'] });
    expect((await createProposal(u, { entityKey: 'victor-igboekwe', kind: 'promote', toRole: 'x' }, 'user')).ok).toBe(false);
  });

  it('training: empty templates are never assigned; approved content is, and a scenario pass records', async () => {
    await ensureTemplates(u);
    expect(await runTrainingScheduler(u, NOW)).toEqual({ assigned: 0, overdue: 0 });
    expect((await approveCourse(u, 'ethics-core', { body: 'b', scenarios: [], passMark: 1, intervalDays: 30 })).ok).toBe(false);
    expect((await approveCourse(u, 'ethics-core', { body: 'b', scenarios: [{ id: 's', prompt: 'p', mustMention: ['approval'] }], passMark: 1, intervalDays: 30 })).ok).toBe(true);
    const r = await runTrainingScheduler(u, NOW);
    expect(r.assigned).toBeGreaterThan(400);
    const t = (await prisma.orgTraining.findFirst({ where: { userId: u } }))!;
    expect(await recordAttempt(u, t.id, { s: 'no' })).toMatchObject({ ok: true, passed: false });
    expect(await recordAttempt(u, t.id, { s: 'needs approval' })).toMatchObject({ ok: true, passed: true });
    expect((await runTrainingScheduler(u, new Date(NOW.getTime() + 40 * 86_400_000))).overdue).toBeGreaterThan(0);
  });

  it('opens a review per subsidiary head per half-year, once; MAMBA view is a capped hypothesis', async () => {
    const n = await openReviews(u, NOW);
    expect(n).toBeGreaterThanOrEqual(5);
    expect(await openReviews(u, NOW)).toBe(0);
    const rv = (await prisma.orgReview.findFirst({ where: { userId: u } }))!;
    expect((await submitView(u, rv.id, 'MAMBA', 'adversarial view')).ok).toBe(true);
    expect((await submitView(other, rv.id, 'WHINK', 'x')).ok).toBe(false);
    expect((await prisma.hypothesis.findFirst({ where: { userId: u } }))!.confidence).toBeLessThanOrEqual(0.4);
    await submitView(u, rv.id, 'WHINK', 'view');
    expect((await prisma.orgReview.findUnique({ where: { id: rv.id } }))!.status).toBe('COMPLETE');
  });

  it('credits a viable idea to its author and refuses unknown authors', async () => {
    const idea = await prisma.founderIdea.create({ data: { userId: u, title: 't' } });
    expect(await markIdeaViable(u, idea.id, 'nobody')).toBe(false);
    expect(await markIdeaViable(u, idea.id, 'whink')).toBe(true);
    expect((await prisma.founderIdea.findUnique({ where: { id: idea.id } }))!.authorKey).toBe('whink');
  });
});

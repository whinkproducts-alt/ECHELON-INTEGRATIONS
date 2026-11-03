/** R04/R07/R08 against a real isolated Postgres: lockdown claim filter and transitions, profile constraints, briefing rows. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
vi.unmock('@/lib/safety/lockdown');
import { prisma } from '@/lib/db';
import { claimDueJobs } from '@/lib/worker/scheduler';
import { getSafetyState, setLockdown } from '@/lib/safety/lockdown';
import { activateProfile, activeProfile, saveProfile } from '@/lib/model-router/priority';
import { getTodaysBriefing, markBriefingSeen, regenerateBriefing } from '@/lib/briefing/daily';

const enabled = !!process.env.M1_EXECUTION_DATABASE_URL;
let a = '', b = '';
const worker = `readiness-${randomUUID()}`;

describe.skipIf(!enabled)('readiness real database', () => {
  beforeAll(async () => {
    if (process.env.M1_EXECUTION_DATABASE_URL !== process.env.DATABASE_URL || !/test/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error('Isolated test database required');
    vi.stubEnv('ENCRYPTION_KEY', 'cd'.repeat(32));
    a = (await prisma.user.create({ data: { email: `ready-a-${randomUUID()}@example.test` } })).id;
    b = (await prisma.user.create({ data: { email: `ready-b-${randomUUID()}@example.test` } })).id;
  });
  afterAll(async () => {
    if (a) {
      await prisma.action.deleteMany({ where: { userId: { in: [a, b] } } });
      await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
    }
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it('a locked account gets no claims; another account is unaffected; release restores claims', async () => {
    const past = new Date(Date.now() - 60_000);
    const ja = await prisma.agentJob.create({ data: { userId: a, jobKey: `test:${randomUUID()}`, nextRunAt: past } });
    const jb = await prisma.agentJob.create({ data: { userId: b, jobKey: `test:${randomUUID()}`, nextRunAt: past } });
    const engaged = await setLockdown(a, true, { reason: 'integration' });
    expect(engaged).toMatchObject({ ok: true, changed: true, state: { lockedDown: true, epoch: 1 } });
    const claimed = await claimDueJobs(worker, 1000);
    expect(claimed.some((j) => j.id === ja.id)).toBe(false);
    expect(claimed.some((j) => j.id === jb.id)).toBe(true);
    const released = await setLockdown(a, false, { expectedEpoch: 1 });
    expect(released).toMatchObject({ ok: true, state: { lockedDown: false, epoch: 2 } });
    expect((await claimDueJobs(worker, 1000)).some((j) => j.id === ja.id)).toBe(true);
    const rows = await prisma.action.findMany({ where: { userId: a, action: { in: ['lockdown_engaged', 'lockdown_released'] } } });
    expect(rows.map((r) => r.action).sort()).toEqual(['lockdown_engaged', 'lockdown_released']);
  });

  it('engaging stops queued capability work for that account only, and it is not resumed on release', async () => {
    const qa = await prisma.agentJob.create({ data: { userId: a, jobKey: `capability:${randomUUID()}`, nextRunAt: new Date(), lastStatus: 'QUEUED', capabilityRequestEnc: 'x' } });
    const qb = await prisma.agentJob.create({ data: { userId: b, jobKey: `capability:${randomUUID()}`, nextRunAt: new Date(), lastStatus: 'QUEUED', capabilityRequestEnc: 'x' } });
    const s = await getSafetyState(a);
    await setLockdown(a, true);
    await setLockdown(a, false, { expectedEpoch: s.epoch + 1 });
    expect((await prisma.agentJob.findUniqueOrThrow({ where: { id: qa.id } })).lastStatus).toBe('BLOCKED_LOCKDOWN');
    expect((await prisma.agentJob.findUniqueOrThrow({ where: { id: qb.id } })).lastStatus).toBe('QUEUED');
    expect((await claimDueJobs(worker, 1000)).some((j) => j.id === qa.id)).toBe(false);
  });

  it('concurrent engage requests serialise: one transition, one ledger row', async () => {
    const before = (await getSafetyState(b)).epoch;
    const results = await Promise.all(Array.from({ length: 5 }, () => setLockdown(b, true)));
    expect(results.filter((r) => r.ok && r.changed)).toHaveLength(1);
    expect((await getSafetyState(b)).epoch).toBe(before + 1);
    await setLockdown(b, false);
  });

  it('a stale release is refused', async () => {
    const s = await getSafetyState(a);
    await setLockdown(a, true);
    expect(await setLockdown(a, false, { expectedEpoch: s.epoch })).toMatchObject({ ok: false, status: 409 });
    await setLockdown(a, false, { expectedEpoch: s.epoch + 1 });
  });

  it('profiles: one active per account, revision increments, another account cannot activate', async () => {
    const p1 = await saveProfile(a, { name: 'Daily', choices: ['local-default'], activate: true });
    const p2 = await saveProfile(a, { name: 'Cloud first', choices: ['anthropic-sonnet', 'local-default'] });
    expect(p1.ok && p2.ok).toBe(true);
    if (!p1.ok || !p2.ok) return;
    expect((await activateProfile(a, p2.profile.id)).ok).toBe(true);
    expect((await activeProfile(a))?.id).toBe(p2.profile.id);
    expect(await prisma.modelRoutingProfile.count({ where: { userId: a, active: true } })).toBe(1);
    const again = await saveProfile(a, { name: 'Cloud first', choices: ['local-default'] });
    expect(again.ok && again.profile.revision).toBe(2);
    expect(await activateProfile(b, p1.profile.id)).toMatchObject({ ok: false, status: 404 });
    // The database itself refuses a second active profile.
    await expect(prisma.modelRoutingProfile.create({ data: { userId: a, name: 'Rogue', choices: ['local-default'], active: true } })).rejects.toThrow();
    await expect(prisma.modelRoutingProfile.create({ data: { userId: a, name: 'Too many', choices: ['a', 'b', 'c', 'd'] } })).rejects.toThrow();
  });

  it('briefing: generated once per local day, encrypted at rest, seen is per account', async () => {
    const now = new Date();
    const first = await getTodaysBriefing(a, now);
    const second = await getTodaysBriefing(a, now);
    expect(second.id).toBe(first.id);
    const row = await prisma.dailyBriefing.findUniqueOrThrow({ where: { id: first.id! } });
    expect(row.scriptEnc).toBeTruthy();
    expect(row.scriptEnc).not.toContain('briefing');
    expect(await markBriefingSeen(b, first.id!)).toBe(false);
    expect(await markBriefingSeen(a, first.id!)).toBe(true);
    const next = await regenerateBriefing(a, now);
    expect(next.revision).toBe(first.revision + 1);
    expect(next.seen).toBe(false);
  });
});

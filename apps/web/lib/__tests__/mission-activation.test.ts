import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, resetDb } from './helpers/mock-db';
const recordActionSafe = vi.fn().mockResolvedValue({ id: 'l' });
const isLockedDown = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/ledger', () => ({ recordActionSafe: (e: unknown) => recordActionSafe(e) }));
vi.mock('@/lib/safety/lockdown', () => ({ isLockedDown: (u: string) => isLockedDown(u) }));
vi.mock('@/lib/agent-loader', () => ({ getOrgKit: async () => ({ agents: [
  { agent_id: 'a1', state: 'dormant' }, { agent_id: 'a2', state: 'dormant' }, { agent_id: 'a3', state: 'dormant' },
  { agent_id: 'sus', state: 'suspended' }, { agent_id: 'ret', state: 'retired' },
] }) }));
import { wakeForMission, returnToDormant, withMissionAgents, effectiveAgentState, reapStaleActivations, MAX_WOKEN_PER_MISSION } from '@/lib/mission-activation';

beforeEach(() => {
  resetDb(); recordActionSafe.mockClear(); isLockedDown.mockReset().mockResolvedValue(false);
  db.missionActivation.findFirst.mockResolvedValue(null);
  db.missionActivation.upsert.mockResolvedValue({});
  db.missionActivation.updateMany.mockResolvedValue({ count: 0 });
});

describe('R13 mission activation', () => {
  it('wakes only the named agents and ledgers it', async () => {
    const r = await wakeForMission('u1', 'm1', ['a1', 'a2', 'a1']);
    expect(r).toEqual({ ok: true, woken: ['a1', 'a2'], alreadyAwake: [] });
    expect(db.missionActivation.upsert).toHaveBeenCalledTimes(2);
    expect(db.missionActivation.upsert.mock.calls.map((c: any[]) => c[0].create.agentId)).toEqual(['a1', 'a2']);
    expect(recordActionSafe.mock.calls[0][0]).toMatchObject({ action: 'mission_agents_woken', userId: 'u1', correlationId: 'm1' });
  });
  it('refuses suspended, retired, unknown agents and wakes nobody', async () => {
    for (const [id, err] of [['sus', 'agent_not_available'], ['ret', 'agent_not_available'], ['ghost', 'unknown_agent']] as const) {
      expect(await wakeForMission('u1', 'm', ['a1', id])).toMatchObject({ ok: false, error: err });
    }
    expect(db.missionActivation.upsert).not.toHaveBeenCalled();
  });
  it('refuses during lockdown and over the cap', async () => {
    isLockedDown.mockResolvedValue(true);
    expect(await wakeForMission('u1', 'm', ['a1'])).toMatchObject({ ok: false, error: 'lockdown' });
    isLockedDown.mockResolvedValue(false);
    const many = Array.from({ length: MAX_WOKEN_PER_MISSION + 1 }, (_, i) => `x${i}`);
    expect(await wakeForMission('u1', 'm', many)).toMatchObject({ ok: false, error: 'too_many_agents' });
    expect(db.missionActivation.upsert).not.toHaveBeenCalled();
  });
  it('an agent awake for another mission is reported, not duplicated', async () => {
    db.missionActivation.findFirst.mockResolvedValueOnce({ id: 'x' });
    expect(await wakeForMission('u1', 'm2', ['a1'])).toMatchObject({ woken: [], alreadyAwake: ['a1'] });
  });
  it('returns to dormant after the mission, and also when the mission throws', async () => {
    db.missionActivation.updateMany.mockResolvedValue({ count: 2 });
    await expect(withMissionAgents('u1', 'm1', ['a1', 'a2'], async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    const upd = db.missionActivation.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ userId: 'u1', missionId: 'm1', status: 'ACTIVE' });
    expect(upd.data.status).toBe('RETURNED');
    expect(recordActionSafe.mock.calls.map((c: any[]) => c[0].action)).toEqual(['mission_agents_woken', 'mission_agents_dormant']);
  });
  it('a refused wake runs nothing', async () => {
    const fn = vi.fn();
    await expect(withMissionAgents('u1', 'm1', ['sus'], fn)).rejects.toThrow(/refused/);
    expect(fn).not.toHaveBeenCalled();
  });
  it('returnToDormant is idempotent and quiet when nothing was awake', async () => {
    expect(await returnToDormant('u1', 'm1')).toBe(0);
    expect(recordActionSafe).not.toHaveBeenCalled();
  });
  it('effective state: awake only while a live activation exists; other states untouched', async () => {
    db.missionActivation.findFirst.mockResolvedValueOnce({ id: 'x' });
    expect(await effectiveAgentState('u1', 'a1', 'dormant')).toBe('active');
    expect(await effectiveAgentState('u1', 'a1', 'dormant')).toBe('dormant');
    expect(await effectiveAgentState('u1', 'sus', 'suspended')).toBe('suspended');
  });
  it('waking creates no grant or delegation', async () => {
    await wakeForMission('u1', 'm1', ['a1']);
    expect(db.delegation.create).not.toHaveBeenCalled();
    expect(db.capabilityGrant?.create).not.toHaveBeenCalled();
  });
  it('the reaper returns stale activations', async () => {
    db.missionActivation.updateMany.mockResolvedValue({ count: 3 });
    expect(await reapStaleActivations('u1', 1000, new Date(10_000))).toBe(3);
    expect(db.missionActivation.updateMany.mock.calls[0][0].where.activatedAt.lt).toEqual(new Date(9000));
  });
});

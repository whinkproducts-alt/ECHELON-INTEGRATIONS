/** R07 lockdown: the real module (not the shared test double) against the mock Prisma. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.unmock('@/lib/safety/lockdown');
import { db, resetDb } from './helpers/mock-db';
// The transaction client is the same mock, plus the raw helpers the module uses.
const { raw, client, holder } = vi.hoisted(() => {
  const raw = { $transaction: vi.fn(), $queryRaw: vi.fn(), $executeRaw: vi.fn() };
  const holder: { db: any } = { db: null };
  const client: any = new Proxy({}, { get: (_t, k: string) => (k in raw ? (raw as any)[k] : holder.db[k]) });
  return { raw, client, holder };
});
vi.mock('@/lib/db', () => ({ prisma: client }));
holder.db = db;
const recordAction = vi.fn().mockResolvedValue({ id: 'l1' });
const recordActionSafe = vi.fn().mockResolvedValue({ id: 'l2' });
vi.mock('@/lib/ledger', () => ({ recordAction: (...a: unknown[]) => recordAction(...a), recordActionSafe: (e: unknown) => recordActionSafe(e) }));

import { assertNotLockedDown, getSafetyState, isLockedDown, LockdownError, setLockdown } from '@/lib/safety/lockdown';

beforeEach(() => {
  resetDb();
  recordAction.mockClear();
  recordActionSafe.mockClear();
  raw.$transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(client));
  raw.$queryRaw.mockReset();
  raw.$executeRaw.mockReset().mockResolvedValue(1);
});

describe('reading the safety state', () => {
  it('no row means not locked', async () => {
    db.accountSafetyState.findUnique.mockResolvedValue(null);
    expect(await isLockedDown('u1')).toBe(false);
    expect(db.accountSafetyState.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
  it('a locked row is locked, with its epoch', async () => {
    db.accountSafetyState.findUnique.mockResolvedValue({ lockedDown: true, epoch: 4, reason: 'travel', changedAt: new Date(0) });
    expect(await getSafetyState('u1')).toMatchObject({ lockedDown: true, epoch: 4, reason: 'travel' });
  });
  it('fails closed: an unreadable state is treated as locked', async () => {
    db.accountSafetyState.findUnique.mockRejectedValue(new Error('db down'));
    const s = await getSafetyState('u1');
    expect(s.lockedDown).toBe(true);
    expect(s.unknown).toBe(true);
  });
  it('fails closed without an account id', async () => {
    expect(await isLockedDown('')).toBe(true);
  });
  it('assertNotLockedDown throws and ledgers when locked, passes when not', async () => {
    db.accountSafetyState.findUnique.mockResolvedValueOnce({ lockedDown: true, epoch: 2, reason: null, changedAt: new Date() });
    await expect(assertNotLockedDown('u1', 'deliver:SMS', 'c1')).rejects.toBeInstanceOf(LockdownError);
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', action: 'lockdown_blocked', status: 'DENIED', tool: 'deliver:SMS' }));
    db.accountSafetyState.findUnique.mockResolvedValueOnce(null);
    await expect(assertNotLockedDown('u1', 'deliver:SMS')).resolves.toBeUndefined();
  });
});

describe('transitions', () => {
  it('engage: row-locked read, epoch increment, queued work stopped, ledger in the same transaction', async () => {
    raw.$queryRaw.mockResolvedValue([{ lockedDown: false, epoch: 3 }]);
    db.agentJob.updateMany.mockResolvedValue({ count: 2 });
    db.agentExecution.updateMany.mockResolvedValue({ count: 1 });
    db.accountSafetyState.upsert.mockResolvedValue({ lockedDown: true, epoch: 4, reason: 'test', changedAt: new Date() });
    const r = await setLockdown('u1', true, { reason: 'test' });
    expect(r).toMatchObject({ ok: true, changed: true, state: { lockedDown: true, epoch: 4 } });
    expect(raw.$transaction).toHaveBeenCalledTimes(1);
    // queued capability jobs and live analyses for THIS account only
    expect(db.agentJob.updateMany.mock.calls[0][0].where).toMatchObject({ userId: 'u1', jobKey: { startsWith: 'capability:' }, lastStatus: 'QUEUED' });
    expect(db.agentExecution.updateMany.mock.calls[0][0]).toMatchObject({ where: { userId: 'u1' }, data: { status: 'CANCELLED', reason: 'lockdown' } });
    // ledger written with the transaction client
    expect(recordAction.mock.calls[0][0]).toMatchObject({ userId: 'u1', action: 'lockdown_engaged', status: 'EXECUTED' });
    expect(recordAction.mock.calls[0][1]).toBe(client);
    expect(recordAction.mock.calls[0][0].inputSummary).toContain('epoch 3 -> 4');
  });
  it('engaging when already locked changes nothing', async () => {
    raw.$queryRaw.mockResolvedValue([{ lockedDown: true, epoch: 5 }]);
    const r = await setLockdown('u1', true);
    expect(r).toMatchObject({ ok: true, changed: false });
    expect(db.accountSafetyState.upsert).not.toHaveBeenCalled();
    expect(recordAction).not.toHaveBeenCalled();
  });
  it('release with a stale epoch is refused (a stale screen cannot undo a newer lockdown)', async () => {
    raw.$queryRaw.mockResolvedValue([{ lockedDown: true, epoch: 7 }]);
    const r = await setLockdown('u1', false, { expectedEpoch: 6 });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(db.accountSafetyState.upsert).not.toHaveBeenCalled();
  });
  it('release does not cancel or resume any work', async () => {
    raw.$queryRaw.mockResolvedValue([{ lockedDown: true, epoch: 7 }]);
    db.accountSafetyState.upsert.mockResolvedValue({ lockedDown: false, epoch: 8, reason: null, changedAt: new Date() });
    const r = await setLockdown('u1', false, { expectedEpoch: 7 });
    expect(r).toMatchObject({ ok: true, changed: true, state: { lockedDown: false, epoch: 8 } });
    expect(db.agentJob.updateMany).not.toHaveBeenCalled();
    expect(db.agentExecution.updateMany).not.toHaveBeenCalled();
    expect(recordAction.mock.calls[0][0]).toMatchObject({ action: 'lockdown_released' });
    expect(recordAction.mock.calls[0][1]).toBe(client);
  });
  it('control characters in the reason are removed and it is capped', async () => {
    raw.$queryRaw.mockResolvedValue([]);
    db.agentJob.updateMany.mockResolvedValue({ count: 0 });
    db.agentExecution.updateMany.mockResolvedValue({ count: 0 });
    db.accountSafetyState.upsert.mockResolvedValue({ lockedDown: true, epoch: 1, reason: 'x', changedAt: new Date() });
    await setLockdown('u1', true, { reason: `a\nb${'z'.repeat(400)}` });
    const reason = db.accountSafetyState.upsert.mock.calls[0][0].create.reason as string;
    expect(reason).not.toContain('\n');
    expect(reason.length).toBeLessThanOrEqual(200);
  });
});

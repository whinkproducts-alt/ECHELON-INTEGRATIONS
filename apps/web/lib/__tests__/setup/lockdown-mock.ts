/**
 * Shared test double for lib/safety/lockdown. Most suites mock Prisma partially, and the real module fails
 * closed (treats the account as locked) when it cannot read the safety table, so every suite would see a
 * lockdown. Here the state is unlocked unless a test sets lockdownTestState.locked = true. The real module is
 * covered by lockdown.test.ts (vi.unmock) and the real-database lockdown integration test.
 */
import { vi, beforeEach } from 'vitest';

export const lockdownTestState = { locked: false };

vi.mock('@/lib/safety/lockdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/safety/lockdown')>();
  const state = () => (lockdownTestState.locked
    ? { lockedDown: true, epoch: 1, reason: 'test', changedAt: null }
    : { lockedDown: false, epoch: 0, reason: null, changedAt: null });
  return {
    ...actual,
    getSafetyState: vi.fn(async () => state()),
    isLockedDown: vi.fn(async () => lockdownTestState.locked),
    ledgerLockdownBlock: vi.fn(async () => {}),
    assertNotLockedDown: vi.fn(async (_userId: string, boundary: string) => {
      if (lockdownTestState.locked) throw new actual.LockdownError(boundary, 1);
    }),
  };
});

beforeEach(() => { lockdownTestState.locked = false; });

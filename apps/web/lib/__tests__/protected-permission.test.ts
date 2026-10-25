/**
 * Protected actions in the permission engine: Class C at every autonomy level, with or
 * without a delegation row, for both personas. Nothing lowers it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const AUTONOMY = [0, 1, 2, 3, 4];
const PERSONAS = ['WHINK', 'MAMBA'];
const PROTECTED = ['contact_message', 'openclaw__x__post', 'stripe_refund', 'sms_briefing_send'];

async function load(autonomyLevel: number, delegated: boolean) {
  vi.resetModules();
  const recordAction = vi.fn().mockResolvedValue({ id: 'a1' });
  const recordActionSafe = vi.fn().mockResolvedValue({ id: 'a1' });
  vi.doMock('@/lib/db', () => ({
    prisma: {
      userProfile: { findUnique: vi.fn().mockResolvedValue({ autonomyLevel }) },
      delegation: { findFirst: vi.fn().mockResolvedValue(delegated ? { id: 'd1', isActive: true } : null) },
    },
  }));
  vi.doMock('@/lib/ledger', () => ({ recordAction, recordActionSafe }));
  const engine = await import('@/lib/permission-engine');
  const guarded = await import('@/lib/guarded-action');
  return { ...engine, runGuarded: guarded.runGuarded, recordAction, recordActionSafe };
}

describe('checkPermission on protected actions', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const level of AUTONOMY) {
    for (const delegated of [false, true]) {
      it(`autonomy ${level}, delegation ${delegated ? 'present' : 'absent'}: never allowed, any requested class`, async () => {
        const { checkPermission } = await load(level, delegated);
        for (const tool of PROTECTED) {
          for (const requested of ['A', 'B', 'C'] as const) {
            const r = await checkPermission('u1', tool, requested, 'cid');
            expect(r.allowed).toBe(false);
            expect(r.method).toBe('requires_confirmation');
            expect(r.protected).toBe(true);
            expect(r.category).toBeTruthy();
          }
        }
      });
    }
  }

  for (const persona of PERSONAS) {
    for (const level of AUTONOMY) {
      it(`${persona} at autonomy ${level} with a delegation: the guarded action does not run`, async () => {
        const { runGuarded } = await load(level, true);
        const fn = vi.fn().mockResolvedValue('sent');
        for (const permissionClass of ['A', 'B', 'C'] as const) {
          const res = await runGuarded({ userId: 'u1', capability: 'contact_message', permissionClass, action: 'x', persona }, fn);
          expect(res.ok).toBe(false);
        }
        expect(fn).not.toHaveBeenCalled();
      });
    }
  }

  it('a request for a lower class is refused with a ledgered security event; Class C is plain waiting', async () => {
    const { checkPermission, recordAction } = await load(4, true);
    const low = await checkPermission('u1', 'openclaw__x__post', 'A', 'cid');
    expect(low.reason).toMatch(/lower class was refused/);
    expect(recordAction).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', action: 'SECURITY_EVENT: protected_action_downgrade_refused' }));
    recordAction.mockClear();
    const c = await checkPermission('u1', 'openclaw__x__post', 'C', 'cid');
    expect(c.reason).not.toMatch(/lower class/);
    expect(recordAction).not.toHaveBeenCalled();
  });

  it('a downgrade is refused even when the ledger is down', async () => {
    const { checkPermission, recordAction } = await load(4, true);
    recordAction.mockRejectedValue(new Error('db down'));
    const r = await checkPermission('u1', 'contact_call', 'B', 'cid');
    expect(r.allowed).toBe(false);
  });

  it('non-protected actions keep their normal behaviour', async () => {
    const { checkPermission } = await load(1, false);
    expect((await checkPermission('u1', 'calendar_list', 'A')).allowed).toBe(true);
    expect((await checkPermission('u1', 'calendar_create', 'B')).allowed).toBe(false);
    const hi = await load(2, false);
    expect((await hi.checkPermission('u1', 'calendar_create', 'B')).allowed).toBe(true);
  });

  it('capabilityClass reports C for protected names', async () => {
    const { capabilityClass } = await load(1, false);
    expect(capabilityClass('stripe_refund')).toBe('C');
    expect(capabilityClass('contact_create')).toBe('A');
  });
});

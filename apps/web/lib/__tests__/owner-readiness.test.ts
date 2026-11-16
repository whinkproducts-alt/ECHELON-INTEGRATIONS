import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, resetDb } from './helpers/mock-db';
vi.mock('@/lib/db', () => ({ prisma: db }));
const cfg = vi.fn();
vi.mock('@/lib/passkeys/config', () => ({ getWebAuthnConfig: (e?: unknown) => cfg(e) }));
import { ownerReadiness } from '@/lib/auth/owner-readiness';

beforeEach(() => { resetDb(); cfg.mockReset().mockReturnValue({}); });
const env = { WHINK_OWNER_EMAILS: 'Owner@example.com' };
const ids = (r: Awaited<ReturnType<typeof ownerReadiness>>) => r.steps.filter((s) => !s.ok).map((s) => s.id);

describe('owner readiness', () => {
  it('nothing configured: every step open, no db lookup', async () => {
    cfg.mockImplementation(() => { throw new Error('unset'); });
    const r = await ownerReadiness({});
    expect(r.ready).toBe(false);
    expect(ids(r)).toEqual(['owner_email_configured', 'webauthn_configured', 'owner_account_exists', 'owner_has_password', 'passkey_enrolled', 'second_passkey_for_recovery']);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });
  it('account with password but no passkey: enrolment and recovery key still open, both Needs Victor', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'u', passwordHash: 'h' });
    db.passkeyCredential.count.mockResolvedValue(0);
    const r = await ownerReadiness(env);
    expect(ids(r)).toEqual(['passkey_enrolled', 'second_passkey_for_recovery']);
    expect(r.steps.filter((s) => !s.ok).every((s) => s.needsVictor && s.next)).toBe(true);
  });
  it('one passkey is not enough for recovery; two is ready', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'u', passwordHash: 'h' });
    db.passkeyCredential.count.mockResolvedValueOnce(1);
    expect(ids(await ownerReadiness(env))).toEqual(['second_passkey_for_recovery']);
    db.passkeyCredential.count.mockResolvedValueOnce(2);
    expect((await ownerReadiness(env)).ready).toBe(true);
  });
  it('output carries no email or key material', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'u', passwordHash: 'h' });
    db.passkeyCredential.count.mockResolvedValue(0);
    expect(JSON.stringify(await ownerReadiness(env))).not.toMatch(/example\.com|\bh\b"/);
  });
});

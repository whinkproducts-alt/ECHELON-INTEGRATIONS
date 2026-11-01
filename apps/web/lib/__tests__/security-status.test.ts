import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, resetDb } from './helpers/mock-db';

vi.mock('@/lib/db', () => ({ prisma: db }));

import { categoriseEvents, readAuditSummary, readSecretsScanSummary, securityStatus, envIgnored } from '../security-status';

beforeEach(() => resetDb());

describe('security status', () => {
  it('categorises security events', () => {
    expect(categoriseEvents({ INJECTION_ATTEMPT: 3, DEBRIEF_INJECTION_BLOCKED: 1, approval_hash_mismatch: 2, tool_definition_changed: 1, approval_not_found: 4, META_AUTH_ATTEMPT: 5 }))
      .toEqual({ injectionBlocks: 4, hashLockFailures: 3, crossTenantAttempts: 4, other: 5, total: 16 });
  });
  it('computes facts scoped to the user and reads report files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-'));
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, 'scripts', 'audit.json'), JSON.stringify({ metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 2, low: 3, info: 0 } } }));
    fs.writeFileSync(path.join(dir, 'scripts', 'secrets-scan.json'), JSON.stringify({ ranAt: '2026-10-25T00:00:00Z', findings: 0, envFiles: 0 }));
    fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n.env.*\n');
    db.approvalRequest.count.mockResolvedValue(2);
    db.action.groupBy.mockResolvedValueOnce([{ action: 'SECURITY_EVENT: INJECTION_ATTEMPT', _count: { _all: 2 } }]).mockResolvedValueOnce([{ action: 'SECURITY_EVENT: INJECTION_ATTEMPT', _count: { _all: 5 } }]);
    const s = await securityStatus('uA', new Date('2026-10-25T12:00:00Z'), dir);
    expect(db.approvalRequest.count.mock.calls[0][0].where).toMatchObject({ userId: 'uA', status: 'PENDING', permissionClass: 'C' });
    for (const call of db.action.groupBy.mock.calls) expect(call[0].where.userId).toBe('uA');
    expect(s.pendingClassCApprovals).toBe(2);
    expect(s.securityEvents.last24h.injectionBlocks).toBe(2);
    expect(s.securityEvents.last7d.injectionBlocks).toBe(5);
    expect(s.dependencyAudit).toMatchObject({ status: 'ok', vulnerabilities: { high: 1 } });
    expect(s.secretsScan).toMatchObject({ status: 'clean', envFilesIgnoredByGit: true });
    expect(s.headers.csp).toEqual({ nonceBasedScripts: true, frameAncestorsNone: true, objectSrcNone: true });
    expect(s.headers.enforcedByProxy).toContain('Cross-Origin-Opener-Policy');
  });
  it('missing report files say never_run', () => {
    expect(readAuditSummary('/nonexistent/a.json')).toEqual({ status: 'never_run' });
    expect(readSecretsScanSummary('/nonexistent/b.json')).toEqual({ status: 'never_run' });
    expect(envIgnored('/nonexistent')).toBe(false);
  });
  it('output contains no env secret values', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-should-never-appear';
    db.approvalRequest.count.mockResolvedValue(0);
    db.action.groupBy.mockResolvedValue([]);
    expect(JSON.stringify(await securityStatus('uA'))).not.toContain('should-never-appear');
  });
  it('the repo .gitignore really ignores .env files', () => {
    const root = path.resolve(__dirname, '..', '..', '..', '..');
    expect(envIgnored(root)).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('ledger single write path', () => {
  it('no file under lib/ or app/ writes prisma.action outside lib/ledger.ts', () => {
    const ledger = path.join(ROOT, 'lib', 'ledger.ts');
    const files = [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'app'))].filter((f) => f !== ledger);
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) =>
      /\.action\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('no raw SQL writes to the actions table outside lib/ledger.ts', () => {
    const ledger = path.join(ROOT, 'lib', 'ledger.ts');
    const files = [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'app'))].filter((f) => f !== ledger);
    const offenders = files.filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return /\$(execute|query)Raw(Unsafe)?\b[\s\S]{0,400}?\bactions\b/i.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

describe('ledger functions', () => {
  const create = vi.fn();
  const updateMany = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    create.mockReset().mockResolvedValue({ id: 'a1' });
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    vi.doMock('@/lib/db', () => ({ prisma: { action: { create, updateMany } } }));
  });

  it('recordAction truncates summaries and defaults initiator', async () => {
    const { recordAction, SUMMARY_CAP } = await import('../ledger');
    await recordAction({
      userId: 'u1', action: 'x', permissionClass: 'A', status: 'VALIDATED',
      inputSummary: 'a'.repeat(5000), outputSummary: 'b'.repeat(5000),
    });
    const data = create.mock.calls[0][0].data;
    expect(data.userId).toBe('u1');
    expect(data.initiator).toBe('system');
    expect(data.inputSummary.length).toBe(SUMMARY_CAP);
    expect(data.outputSummary.length).toBe(SUMMARY_CAP);
  });

  it('recordAction requires userId', async () => {
    const { recordAction } = await import('../ledger');
    await expect(recordAction({ userId: '', action: 'x', permissionClass: 'A', status: 'FAILED' })).rejects.toThrow();
  });

  it('recordActionSafe never throws', async () => {
    create.mockRejectedValue(new Error('db down'));
    const { recordActionSafe } = await import('../ledger');
    await expect(
      recordActionSafe({ userId: 'u1', action: 'x', permissionClass: 'A', status: 'FAILED' }),
    ).resolves.toBeNull();
  });

  it('updateActionStatus scopes by both id and userId', async () => {
    const { updateActionStatus } = await import('../ledger');
    const ok = await updateActionStatus('u1', 'act-9', { status: 'VALIDATED' });
    expect(ok).toBe(true);
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: 'act-9', userId: 'u1' });
  });

  it('updateActionStatus returns false when another tenant owns the row', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const { updateActionStatus } = await import('../ledger');
    expect(await updateActionStatus('attacker', 'act-9', { status: 'VALIDATED' })).toBe(false);
  });

  it('updateActionStatus changes nothing for a non-owner (real ownership semantics)', async () => {
    const rows = [{ id: 'act-9', userId: 'owner', status: 'AWAITING_APPROVAL', outputSummary: 'orig' }];
    updateMany.mockImplementation(async ({ where, data }: any) => {
      const hit = rows.filter((r) => r.id === where.id && r.userId === where.userId);
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    });
    const { updateActionStatus } = await import('../ledger');
    expect(await updateActionStatus('attacker', 'act-9', { status: 'VALIDATED', outputSummary: 'pwned' })).toBe(false);
    expect(rows[0]).toEqual({ id: 'act-9', userId: 'owner', status: 'AWAITING_APPROVAL', outputSummary: 'orig' });
    expect(await updateActionStatus('owner', 'act-9', { status: 'VALIDATED' })).toBe(true);
    expect(rows[0].status).toBe('VALIDATED');
  });

  it('updateActionStatus rejects empty userId or actionId', async () => {
    const { updateActionStatus } = await import('../ledger');
    await expect(updateActionStatus('', 'a', { status: 'FAILED' })).rejects.toThrow();
    await expect(updateActionStatus('u', '', { status: 'FAILED' })).rejects.toThrow();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

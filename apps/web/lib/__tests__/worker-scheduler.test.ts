import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { db, resetDb } from './helpers/mock-db';

const raw = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, k: string) => (k === '$queryRaw' ? raw.queryRaw : (db as any)[k]) }) }));

import { desiredJobs, ensureJobs, claimDueJobs, completeJob, staggerMs, LEASE_MS } from '../worker/scheduler';
import { workerConcurrency, jobTimeoutMs } from '../worker/runner';

beforeEach(() => { resetDb(); raw.queryRaw.mockReset(); });

describe('job table', () => {
  it('desired jobs are the 22 enabled roster entries plus the two system jobs (skills sweeper, swarm resume), with unique keys', () => {
    const d = desiredJobs();
    expect(d).toHaveLength(24);
    expect(new Set(d.map((j) => j.jobKey)).size).toBe(24);
    expect(d.find((j) => j.job === 'skills_sweeper')!.critical).toBe(true);
  });
  it('ensureJobs creates only the missing rows for that user, staggered, skipDuplicates', async () => {
    const all = desiredJobs();
    db.agentJob.findMany.mockResolvedValue(all.slice(0, 21).map((j) => ({ jobKey: j.jobKey })));
    db.agentJob.createMany.mockResolvedValue({ count: 3 });
    const now = new Date('2026-10-26T00:00:00Z');
    expect(await ensureJobs('uA', now)).toBe(3);
    expect(db.agentJob.findMany.mock.calls[0][0].where).toEqual({ userId: 'uA' });
    const arg = db.agentJob.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data).toHaveLength(3);
    for (const r of arg.data) { expect(r.userId).toBe('uA'); expect(r.nextRunAt.getTime() - now.getTime()).toBeLessThan(10 * 60_000); }
    await expect(ensureJobs('')).rejects.toThrow();
  });
  it('ensureJobs is a no-op when all rows exist', async () => {
    db.agentJob.findMany.mockResolvedValue(desiredJobs().map((j) => ({ jobKey: j.jobKey })));
    expect(await ensureJobs('uA')).toBe(0);
    expect(db.agentJob.createMany).not.toHaveBeenCalled();
  });
  it('stagger is stable and bounded', () => {
    expect(staggerMs('k', 'u', 3_600_000)).toBe(staggerMs('k', 'u', 3_600_000));
    expect(staggerMs('k', 'u', 120_000)).toBeLessThan(120_000);
  });
});

describe('claiming', () => {
  it('is one atomic UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING with a 10 minute lease', async () => {
    raw.queryRaw.mockResolvedValue([{ id: 'j1', jobKey: 'k', userId: 'uA', consecutiveFailures: 0, runs: 0 }]);
    const now = new Date('2026-10-26T00:00:00Z');
    const rows = await claimDueJobs('w1', 3, now);
    expect(rows).toHaveLength(1);
    const [strings, ...vals] = raw.queryRaw.mock.calls[0] as [string[], ...unknown[]];
    const sql = strings.join('?');
    expect(sql).toMatch(/UPDATE agent_jobs/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/RETURNING/);
    expect(sql).toMatch(/"leaseUntil" IS NULL OR "leaseUntil" </);
    expect(vals).toContain('w1');
    expect(vals).toContain(3);
    expect((vals[0] as Date).getTime()).toBe(now.getTime() + LEASE_MS);
    expect(LEASE_MS).toBe(600_000);
  });
  it('claims nothing when there are no free slots', async () => {
    expect(await claimDueJobs('w1', 0)).toEqual([]);
    expect(raw.queryRaw).not.toHaveBeenCalled();
  });
  it('completion only succeeds while this worker still holds the lease and is user scoped', async () => {
    db.agentJob.updateMany.mockResolvedValue({ count: 0 });
    const job = { id: 'j1', jobKey: 'k', userId: 'uA', consecutiveFailures: 2, runs: 5 };
    expect(await completeJob(job, 'w1', 'FAILED', 60_000, 'x'.repeat(500), new Date('2026-10-26T00:00:00Z'))).toBe(false);
    const arg = db.agentJob.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'j1', userId: 'uA', leaseOwner: 'w1' });
    expect(arg.data).toMatchObject({ leaseUntil: null, leaseOwner: null, runs: 6, consecutiveFailures: 3, lastStatus: 'FAILED' });
    expect(arg.data.lastError.length).toBe(160);
    expect(arg.data.nextRunAt.getTime()).toBe(new Date('2026-10-26T00:00:00Z').getTime() + 60_000 * 8);
  });
  it('success resets failures; skip leaves runs alone', async () => {
    db.agentJob.updateMany.mockResolvedValue({ count: 1 });
    const job = { id: 'j1', jobKey: 'k', userId: 'uA', consecutiveFailures: 2, runs: 5 };
    await completeJob(job, 'w1', 'OK', 60_000, null);
    expect(db.agentJob.updateMany.mock.calls[0][0].data).toMatchObject({ consecutiveFailures: 0, runs: 6 });
    await completeJob(job, 'w1', 'SKIPPED', 60_000, 'offline');
    expect(db.agentJob.updateMany.mock.calls[1][0].data).toMatchObject({ consecutiveFailures: 2, runs: 5 });
  });
});

describe('worker config', () => {
  it('concurrency defaults to 3 and is bounded; timeout has a default', () => {
    expect(workerConcurrency({} as never)).toBe(3);
    expect(workerConcurrency({ WORKER_CONCURRENCY: '5' } as never)).toBe(5);
    expect(workerConcurrency({ WORKER_CONCURRENCY: '0' } as never)).toBe(3);
    expect(workerConcurrency({ WORKER_CONCURRENCY: '999' } as never)).toBe(3);
    expect(jobTimeoutMs({} as never)).toBe(120_000);
  });
});

describe('workers never get outbound paths', () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
  walk(path.resolve(__dirname, '../worker'));
  files.push(path.resolve(__dirname, '../../scripts/worker.ts'));
  const FORBIDDEN = /from '(@\/lib|\.\.\/lib|\.\.\/\.\.)\/(tool-registry|tool-loop|comms|social|connectors|openclaw-client|twilio-adapter|gateway-chat|approvals|guarded-action)/;
  it('no worker file imports a tool executor, comms, social, connector or gateway module', () => {
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(FORBIDDEN);
  });
  it('no worker file writes the action table directly or calls a provider SDK/URL', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/prisma\.action\.(create|createMany|update|updateMany|upsert|delete|deleteMany)/);
      expect(src, f).not.toMatch(/@anthropic-ai|from 'openai'|api\.openai\.com/);
    }
  });
  it('the only model entry point is workerAsk (admitted chat, no tools argument)', () => {
    const src = readFileSync(path.resolve(__dirname, '../worker/context.ts'), 'utf8');
    expect(src).toMatch(/admittedChatOnce/);
    expect(src).not.toMatch(/chatOnce\(\{[^}]*tools/);
    expect(src).not.toMatch(/from '@\/lib\/tool-loop'/);
  });
});

/** R08: daily briefing dates, composition from records only, and once-per-day generation. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, resetDb } from './helpers/mock-db';
vi.mock('@/lib/db', () => ({ prisma: db }));
const recordActionSafe = vi.fn().mockResolvedValue({ id: 'l1' });
vi.mock('@/lib/ledger', () => ({ recordActionSafe: (e: unknown) => recordActionSafe(e), recordAction: vi.fn() }));
vi.mock('@/lib/key-encryption', () => ({
  isEncryptionConfigured: () => true,
  encryptKey: (s: string) => `enc:${Buffer.from(s).toString('base64')}`,
  decryptKey: (s: string) => Buffer.from(s.slice(4), 'base64').toString(),
}));
import { composeBriefing, getTodaysBriefing, localDateFor, markBriefingSeen, safeTimeZone, sourceRefs, type BriefingSources } from '@/lib/briefing/daily';

const EMPTY: BriefingSources = {
  tasks: { overdue: [], dueToday: [], inProgress: 0, blocked: 0 },
  approvals: { pending: 0, executed: 0, denied: 0, expired: 0, failed: 0 },
  executions: { running: 0, succeeded: 0, failed: 0, blocked: 0 },
  swarm: { running: 0, done: 0, failed: 0 },
  usage: { unknownCostCalls: 0, costMicros: 0, events: 0 },
};

beforeEach(() => { resetDb(); recordActionSafe.mockClear(); });

describe('local day', () => {
  it('uses the Founder time zone, not UTC', () => {
    const t = new Date('2026-11-02T05:30:00Z'); // 22:30 on 1 Nov in Edmonton (UTC-7)
    expect(localDateFor('America/Edmonton', t)).toBe('2026-11-01');
    expect(localDateFor('UTC', t)).toBe('2026-11-02');
  });
  it('an invalid zone falls back to UTC', () => {
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
    expect(safeTimeZone('')).toBe('UTC');
  });
});

describe('composition', () => {
  it('a quiet day says so, with a source link for every factual line and nothing invented', () => {
    const lines = composeBriefing(EMPTY, { localDate: '2026-11-01' });
    const factual = lines.filter((l) => l.kind !== 'opening' && l.kind !== 'closing');
    expect(factual.every((l) => l.href?.startsWith('/dashboard/'))).toBe(true);
    expect(lines.map((l) => l.text).join(' ')).toMatch(/No open tasks are due or in progress\..*Nothing is waiting for your approval\..*No model cost was recorded/);
    expect(lines.some((l) => l.kind === 'executions' || l.kind === 'swarm')).toBe(false);
  });
  it('an unreadable source is labelled unavailable, never dropped', () => {
    const lines = composeBriefing({ ...EMPTY, approvals: null, usage: null }, { localDate: '2026-11-01' });
    expect(lines.filter((l) => l.unavailable).map((l) => l.kind)).toEqual(['approvals', 'usage']);
  });
  it('lists at most three titles, cleans control characters and counts the rest', () => {
    const overdue = ['A', 'B\u0007\nC', 'D', 'E'].map((title, i) => ({ id: `t${i}`, title }));
    const lines = composeBriefing({ ...EMPTY, tasks: { ...EMPTY.tasks!, overdue } }, { localDate: '2026-11-01' });
    expect(lines.find((l) => l.kind === 'tasks')!.text).toBe('4 tasks overdue: A; B C; D; and 1 more.');
  });
  it('reports approvals and cost from the counts', () => {
    const lines = composeBriefing({ ...EMPTY, approvals: { pending: 1, executed: 2, denied: 1, expired: 0, failed: 0 }, usage: { unknownCostCalls: 0, costMicros: 1_234_567, events: 3 } }, { localDate: '2026-11-01' });
    const text = lines.map((l) => l.text).join(' ');
    expect(text).toContain('1 approval waiting for you now. In the last day: 2 ran, 1 denied, 0 expired.');
    expect(text).toContain('$1.23 across 3 calls');
  });
  it('source references hold ids and counts, never titles', () => {
    const refs = sourceRefs({ ...EMPTY, tasks: { ...EMPTY.tasks!, overdue: [{ id: 'task1', title: 'Secret acquisition' }] } });
    expect(JSON.stringify(refs)).not.toContain('Secret');
    expect(refs[0]).toMatchObject({ kind: 'tasks', ids: ['task1'] });
  });
});

describe('generation', () => {
  const quietSources = () => {
    db.projectTask.findMany.mockResolvedValue([]);
    db.approvalRequest.count.mockResolvedValue(0);
    db.approvalRequest.groupBy.mockResolvedValue([]);
    db.agentExecution.groupBy.mockResolvedValue([]);
    db.swarmRun.groupBy.mockResolvedValue([]);
    db.usageEvent.aggregate.mockResolvedValue({ _sum: { costMicros: 0 }, _count: { costMicros: 0, _all: 0 } });
  };
  it('first request of the day creates revision 1, encrypted, scoped to the account, and ledgers it', async () => {
    db.userProfile.findUnique.mockResolvedValue({ timezone: 'America/Edmonton' });
    db.user.findUnique.mockResolvedValue({ name: 'Victor Igboekwe' });
    db.dailyBriefing.findFirst.mockResolvedValue(null);
    quietSources();
    db.dailyBriefing.create.mockImplementation(async ({ data }: any) => ({ id: 'b1', ...data, createdAt: new Date(), seenAt: null }));
    const v = await getTodaysBriefing('u1', new Date('2026-11-02T05:30:00Z'));
    expect(v).toMatchObject({ id: 'b1', localDate: '2026-11-01', revision: 1, seen: false, stored: true });
    expect(v.lines[0].text).toBe('Good day, Victor. Here is your briefing for 2026-11-01.');
    const data = db.dailyBriefing.create.mock.calls[0][0].data;
    expect(data.userId).toBe('u1');
    expect(data.scriptEnc.startsWith('enc:')).toBe(true);
    expect(db.projectTask.findMany.mock.calls[0][0].where.project).toEqual({ ownerId: 'u1' });
    expect(db.approvalRequest.count.mock.calls[0][0].where.userId).toBe('u1');
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', action: 'daily_briefing_generated' }));
  });
  it('a later request the same day returns the stored script without regenerating', async () => {
    const lines = composeBriefing(EMPTY, { localDate: '2026-11-01' });
    db.userProfile.findUnique.mockResolvedValue({ timezone: 'UTC' });
    db.user.findUnique.mockResolvedValue(null);
    db.dailyBriefing.findFirst.mockResolvedValue({ id: 'b1', localDate: '2026-11-01', timeZone: 'UTC', revision: 2, scriptEnc: `enc:${Buffer.from(JSON.stringify(lines)).toString('base64')}`, sourceCount: 4, sourceCutoff: new Date(), createdAt: new Date(), seenAt: new Date() });
    const v = await getTodaysBriefing('u1', new Date('2026-11-01T12:00:00Z'));
    expect(v).toMatchObject({ revision: 2, seen: true });
    expect(v.lines).toEqual(lines);
    expect(db.dailyBriefing.create).not.toHaveBeenCalled();
  });
  it('two first requests racing share one row (unique constraint)', async () => {
    db.userProfile.findUnique.mockResolvedValue({ timezone: 'UTC' });
    db.user.findUnique.mockResolvedValue(null);
    quietSources();
    const lines = composeBriefing(EMPTY, { localDate: '2026-11-01' });
    db.dailyBriefing.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'winner', localDate: '2026-11-01', timeZone: 'UTC', revision: 1, scriptEnc: `enc:${Buffer.from(JSON.stringify(lines)).toString('base64')}`, sourceCount: 4, sourceCutoff: new Date(), createdAt: new Date(), seenAt: null });
    db.dailyBriefing.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const v = await getTodaysBriefing('u1', new Date('2026-11-01T12:00:00Z'));
    expect(v.id).toBe('winner');
  });
  it('seen is recorded once, only for the caller’s own briefing', async () => {
    db.dailyBriefing.updateMany.mockResolvedValue({ count: 1 });
    expect(await markBriefingSeen('u1', 'b1')).toBe(true);
    expect(db.dailyBriefing.updateMany.mock.calls[0][0].where).toEqual({ id: 'b1', userId: 'u1', seenAt: null });
  });
});

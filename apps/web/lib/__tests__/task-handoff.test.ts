/**
 * Tests for lib/task-handoff.ts
 * Prisma is mocked — no real DB calls.
 *
 * writeHandoff, readHandoff, readRecentHandoffs all require userId (tenant isolation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    taskHandoff: {
      create: mockCreate,
      findFirst: mockFindFirst,
      findMany: mockFindMany,
    },
  },
}));

const { writeHandoff, readHandoff, readRecentHandoffs } = await import('@/lib/task-handoff');

function makeHandoff(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hoff-1',
    taskId: 'task-001',
    agentId: 'backend-engineer',
    userId: 'user-a',
    summary: 'Built the route',
    approach: 'Used Prisma',
    blockers: null,
    nextSteps: 'Write tests',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('writeHandoff', () => {
  beforeEach(() => vi.resetAllMocks());

  it('persists all required fields including userId', async () => {
    const record = makeHandoff();
    mockCreate.mockResolvedValueOnce(record);

    const result = await writeHandoff({
      taskId: 'task-001',
      agentId: 'backend-engineer',
      userId: 'user-a',
      summary: 'Built the route',
      approach: 'Used Prisma',
      nextSteps: 'Write tests',
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const data = mockCreate.mock.calls[0][0].data;
    expect(data.taskId).toBe('task-001');
    expect(data.agentId).toBe('backend-engineer');
    expect(data.userId).toBe('user-a');
    expect(data.summary).toBe('Built the route');
    expect(data.approach).toBe('Used Prisma');
    expect(result.id).toBe('hoff-1');
  });

  it('stores null for optional blockers/nextSteps when omitted', async () => {
    mockCreate.mockResolvedValueOnce(makeHandoff({ blockers: null, nextSteps: null }));
    await writeHandoff({ taskId: 't', agentId: 'a', userId: 'user-a', summary: 's', approach: 'ap' });
    const data = mockCreate.mock.calls[0][0].data;
    expect(data.blockers).toBeNull();
    expect(data.nextSteps).toBeNull();
  });
});

describe('readHandoff', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the most recent record for the taskId scoped to userId', async () => {
    const record = makeHandoff();
    mockFindFirst.mockResolvedValueOnce(record);
    const result = await readHandoff('task-001', 'user-a');
    expect(result?.taskId).toBe('task-001');
    const args = mockFindFirst.mock.calls[0][0];
    expect(args.where.taskId).toBe('task-001');
    expect(args.where.userId).toBe('user-a');
    expect(args.orderBy.createdAt).toBe('desc');
  });

  it('returns null when no record exists', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const result = await readHandoff('nonexistent', 'user-a');
    expect(result).toBeNull();
  });

  it('returns null when userId does not match (tenant isolation)', async () => {
    // Simulate DB returning null because userId filter excluded the row
    mockFindFirst.mockImplementation(({ where }: any) => {
      if (where.userId === 'user-b') return Promise.resolve(null);
      return Promise.resolve(makeHandoff());
    });

    const result = await readHandoff('task-001', 'user-b');
    expect(result).toBeNull();

    // Confirm the where clause included the wrong userId
    const args = mockFindFirst.mock.calls[0][0];
    expect(args.where.userId).toBe('user-b');
  });
});

describe('readRecentHandoffs', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns only records for the given agentId and userId', async () => {
    const records = [makeHandoff(), makeHandoff({ id: 'hoff-2' })];
    mockFindMany.mockResolvedValueOnce(records);

    const result = await readRecentHandoffs('backend-engineer', 'user-a', 5);
    expect(result).toHaveLength(2);
    const args = mockFindMany.mock.calls[0][0];
    expect(args.where.agentId).toBe('backend-engineer');
    expect(args.where.userId).toBe('user-a');
    expect(args.take).toBe(5);
    expect(args.orderBy.createdAt).toBe('desc');
  });

  it('does not return records for a different agentId', async () => {
    mockFindMany.mockImplementation(({ where }: any) => {
      if (where.agentId === 'frontend-engineer') return Promise.resolve([]);
      return Promise.resolve([makeHandoff()]);
    });

    const result = await readRecentHandoffs('frontend-engineer', 'user-a', 10);
    expect(result).toHaveLength(0);
  });

  it('does not return records for a different userId (tenant isolation)', async () => {
    mockFindMany.mockImplementation(({ where }: any) => {
      if (where.userId === 'user-b') return Promise.resolve([]);
      return Promise.resolve([makeHandoff()]);
    });

    const result = await readRecentHandoffs('backend-engineer', 'user-b', 10);
    expect(result).toHaveLength(0);

    // Confirm userId was included in the where clause
    const args = mockFindMany.mock.calls[0][0];
    expect(args.where.userId).toBe('user-b');
  });
});

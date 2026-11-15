import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMonthlyBudgetReport } from './monthly-budget-report';
import { prisma } from '@/lib/db';
import { notify } from '@/lib/notifications/deliver';

vi.mock('@/lib/db', () => ({
  prisma: {
    recommendation: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    usageEvent: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    notificationPreference: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/notifications/deliver', () => ({
  notify: vi.fn(),
}));

// Mock spendCapMicros to avoid process.env dependency in logic
vi.mock('@/lib/model-router/admission', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    spendCapMicros: vi.fn(),
  };
});

import { spendCapMicros } from '@/lib/model-router/admission';

describe('runMonthlyBudgetReport', () => {
  const userId = 'user_123';
  const now = new Date('2026-11-14T10:00:00Z'); // UTC
  // Reported month is October 2026

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delivers a report with settled spend and open holds', async () => {
    vi.mocked(prisma.recommendation.findFirst).mockResolvedValue(null);
    vi.mocked(spendCapMicros).mockReturnValue(25_000_000);

    // Mock settled spend for October
    vi.mocked(prisma.usageEvent.groupBy).mockResolvedValue([
      { state: 'settled', _sum: { costMicros: 15_000_000 } } as any
    ]);

    // Mock open holds (no date filter)
    vi.mocked(prisma.usageEvent.aggregate).mockImplementation((async (args: any) => {
      if (args.where.state?.in) {
        return { _sum: { reservedMicros: 2_000_000 } } as any;
      }
      return { _sum: { costMicros: 0 } } as any;
    }) as never); // Prisma's PrismaPromise brand cannot be satisfied by a plain async mock

    // Mock unpriced events (null costMicros)
    vi.mocked(prisma.usageEvent.findMany).mockResolvedValue([
      { id: 'ev_1' }
    ] as any);

    await runMonthlyBudgetReport({ userId, now });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      title: expect.stringContaining('2026-10'),
      body: expect.stringContaining('Spent:     $15.0000') && 
            expect.stringContaining('Holds:     $2.0000') &&
            expect.stringContaining('Unpriced:  1') &&
            expect.stringContaining('Limit:     $25.00'),
    }));
  });

  it('skips if report for the month already exists', async () => {
    vi.mocked(prisma.recommendation.findFirst).mockResolvedValue({ id: 'rec_1' } as any);

    await runMonthlyBudgetReport({ userId, now });

    expect(prisma.usageEvent.groupBy).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('handles unset spend cap gracefully', async () => {
    vi.mocked(prisma.recommendation.findFirst).mockResolvedValue(null);
    vi.mocked(spendCapMicros).mockReturnValue(null);
    vi.mocked(prisma.usageEvent.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.usageEvent.aggregate).mockResolvedValue({ _sum: {} } as any);
    vi.mocked(prisma.usageEvent.findMany).mockResolvedValue([]);

    await runMonthlyBudgetReport({ userId, now });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('no monthly spend cap is set'),
    }));
  });
});

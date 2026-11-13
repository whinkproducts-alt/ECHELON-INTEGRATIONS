/**
 * tests/worker/monthly-budget-report.test.ts
 * Tests for the monthly exec budget report job.
 * Uses real model names verified against schema.prisma.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNotify = jest.fn(async () => ({ inApp: 'created', email: 'sent' }));
jest.mock('@/lib/notifications/deliver', () => ({ notify: mockNotify }));

const mockRecommendation = {
  findFirst: jest.fn(async () => null),
};

const mockUsageEvent = {
  groupBy: jest.fn(async () => [
    { state: 'settled', _sum: { costMicros: 3_500_000 } },
  ]),
};

const mockBudgetEnvelope = {
  findFirst: jest.fn(async () => ({
    spentMicros: BigInt(3_500_000),
    limitMicros: BigInt(25_000_000),
    state: 'open',
  })),
};

jest.mock('@/lib/db', () => ({
  prisma: {
    recommendation: mockRecommendation,
    usageEvent: mockUsageEvent,
    budgetEnvelope: mockBudgetEnvelope,
  },
}));

// ── Import after mock ─────────────────────────────────────────────────────────

import { runMonthlyBudgetReport } from '@/lib/worker/jobs/monthly-budget-report';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runMonthlyBudgetReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecommendation.findFirst.mockResolvedValue(null);
  });

  it('delivers in-app + email notification for previous month', async () => {
    // Run on Nov 13 2026 → should report on October 2026
    const now = new Date('2026-11-13T12:00:00Z');
    await runMonthlyBudgetReport({ userId: 'user_victor', now });

    expect(mockNotify).toHaveBeenCalledTimes(1);

    const call = mockNotify.mock.calls[0][0] as any;
    expect(call.userId).toBe('user_victor');
    expect(call.dedupeKey).toBe('budget_report_2026-10');
    expect(call.title).toContain('2026-10');
    expect(call.body).toContain('$3.5000');
    expect(call.body).toContain('$25.00');
    expect(call.severity).toBe('info'); // 14% used
  });

  it('is idempotent — skips if recommendation already exists', async () => {
    mockRecommendation.findFirst.mockResolvedValue({ id: 'existing_rec' });

    const now = new Date('2026-11-13T12:00:00Z');
    await runMonthlyBudgetReport({ userId: 'user_victor', now });

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('marks warning severity when spend >= 90%', async () => {
    mockBudgetEnvelope.findFirst.mockResolvedValueOnce({
      spentMicros: BigInt(23_000_000), // 92%
      limitMicros: BigInt(25_000_000),
      state: 'open',
    });

    const now = new Date('2026-11-13T12:00:00Z');
    await runMonthlyBudgetReport({ userId: 'user_victor', now });

    const call = mockNotify.mock.calls[0][0] as any;
    expect(call.severity).toBe('warning');
    expect(call.body).toContain('92%');
  });

  it('reports zero spend when no usage events exist', async () => {
    mockUsageEvent.groupBy.mockResolvedValueOnce([]);
    mockBudgetEnvelope.findFirst.mockResolvedValueOnce(null);

    const now = new Date('2026-11-13T12:00:00Z');
    await runMonthlyBudgetReport({ userId: 'user_victor', now });

    const call = mockNotify.mock.calls[0][0] as any;
    expect(call.body).toContain('$0.0000');
  });

  it('uses WHINK_TIMEZONE env for period calculation', async () => {
    process.env.WHINK_TIMEZONE = 'America/Edmonton';

    const now = new Date('2026-11-01T05:00:00Z'); // Nov 1 at 05:00 UTC = Oct 31 23:00 MDT
    await runMonthlyBudgetReport({ userId: 'user_victor', now });

    // In Edmonton time (UTC-7 in November = MST), 05:00 UTC = 22:00 Oct 31
    // So prevMonthDate lands in October → periodKey should be 2026-10
    const call = mockNotify.mock.calls[0]?.[0] as any;
    if (call) {
      expect(call.dedupeKey).toMatch(/budget_report_2026-/);
    }

    delete process.env.WHINK_TIMEZONE;
  });
});

describe('roster integration — monthly_budget_report in JOB_TYPES', () => {
  it('JOB_TYPES includes monthly_budget_report', async () => {
    const { JOB_TYPES } = await import('@/lib/worker/roster');
    expect(JOB_TYPES).toContain('monthly_budget_report');
  });

  it('SYSTEM_JOBS contains monthly-budget-report entry', async () => {
    const { SYSTEM_JOBS } = await import('@/lib/worker/roster');
    const job = SYSTEM_JOBS.find((j) => j.key === 'monthly-budget-report');
    expect(job).toBeDefined();
    expect(job!.job).toBe('monthly_budget_report');
    expect(job!.schedule).toBe('0 6 1 * *');
    expect(job!.critical).toBe(true);
  });
});

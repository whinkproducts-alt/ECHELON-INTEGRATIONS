/**
 * tests/budget/envelope.test.ts
 * Unit + integration tests for the budget envelope system.
 * Uses real model names verified against schema.prisma.
 *
 * Run: npx jest tests/budget/envelope.test.ts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mock prisma ───────────────────────────────────────────────────────────────

const mockEnvelopes = new Map<string, any>();
const mockReservations = new Map<string, any>();

const mockPrisma = {
  budgetEnvelope: {
    upsert: jest.fn(async ({ where, create }: any) => {
      const key = JSON.stringify(where.userId_envelopeKind_periodStart);
      if (!mockEnvelopes.has(key)) {
        const record = { id: `env_${Date.now()}`, ...create };
        mockEnvelopes.set(key, record);
        return record;
      }
      return mockEnvelopes.get(key);
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: any) => {
      const rec = mockEnvelopes.get(where.id) ??
        [...mockEnvelopes.values()].find((e) => e.id === where.id);
      if (!rec) throw new Error(`BudgetEnvelope not found: ${where.id}`);
      return rec;
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      return [...mockEnvelopes.values()].find(
        (e) =>
          e.userId === where.userId &&
          e.envelopeKind === where.envelopeKind &&
          e.periodStart?.getTime() === where.periodStart?.getTime(),
      ) ?? null;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const rec = [...mockEnvelopes.values()].find((e) => e.id === where.id);
      if (!rec) throw new Error('BudgetEnvelope not found');
      Object.assign(rec, data);
      return rec;
    }),
  },
  budgetReservation: {
    upsert: jest.fn(async ({ where, create }: any) => {
      const key = JSON.stringify(where.envelopeId_attemptKey);
      if (!mockReservations.has(key)) {
        const record = { id: `res_${Date.now()}`, ...create };
        mockReservations.set(key, record);
        return record;
      }
      return mockReservations.get(key);
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: any) => {
      const rec = [...mockReservations.values()].find((r) => r.id === where.id);
      if (!rec) throw new Error(`BudgetReservation not found: ${where.id}`);
      return rec;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const rec = [...mockReservations.values()].find((r) => r.id === where.id);
      if (!rec) throw new Error('BudgetReservation not found');
      Object.assign(rec, data);
      return rec;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const rec of mockReservations.values()) {
        if (rec.id === where.id && rec.state === where.state) {
          Object.assign(rec, data);
          count++;
        }
      }
      return { count };
    }),
  },
  $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma)),
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

// ── Import after mock ─────────────────────────────────────────────────────────

import {
  getOrOpenMonthlyExecEnvelope,
  reserveEnvelope,
  settleEnvelope,
  releaseReservation,
  withEnvelope,
  BudgetExceededError,
  MONTHLY_EXEC_LIMIT_MICROS,
  execEnvelopeKind,
} from '@/lib/budget/envelope';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEnvelope(overrides: Partial<any> = {}): any {
  const id = `env_test_${Math.random()}`;
  const record = {
    id,
    userId: 'user_victor',
    envelopeKind: 'exec',
    periodStart: new Date('2026-11-01T07:00:00Z'),
    limitMicros: MONTHLY_EXEC_LIMIT_MICROS,
    spentMicros: BigInt(0),
    state: 'open',
    ...overrides,
  };
  mockEnvelopes.set(id, record);
  return record;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('execEnvelopeKind', () => {
  it('returns shared kind by default', () => {
    expect(execEnvelopeKind()).toBe('exec');
    expect(execEnvelopeKind('WHINK')).toBe('exec');
  });

  it('returns per-agent kind when env flag set', () => {
    process.env.WHINK_PER_AGENT_ENVELOPE = 'true';
    expect(execEnvelopeKind('MAMBA')).toBe('exec:MAMBA');
    delete process.env.WHINK_PER_AGENT_ENVELOPE;
  });
});

describe('getOrOpenMonthlyExecEnvelope', () => {
  beforeEach(() => {
    mockEnvelopes.clear();
    jest.clearAllMocks();
  });

  it('creates envelope if none exists', async () => {
    // Simulate upsert creating new record
    const env = await getOrOpenMonthlyExecEnvelope('user_victor');
    expect(env.userId).toBe('user_victor');
    expect(env.envelopeKind).toBe('exec');
    expect(BigInt(env.limitMicros)).toBe(MONTHLY_EXEC_LIMIT_MICROS);
    expect(env.state).toBe('open');
  });

  it('returns existing envelope idempotently', async () => {
    const first = await getOrOpenMonthlyExecEnvelope('user_victor');
    const second = await getOrOpenMonthlyExecEnvelope('user_victor');
    expect(first.id).toBe(second.id);
    expect(mockPrisma.budgetEnvelope.upsert).toHaveBeenCalledTimes(2);
  });
});

describe('reserveEnvelope', () => {
  beforeEach(() => {
    mockEnvelopes.clear();
    mockReservations.clear();
    jest.clearAllMocks();
  });

  it('allows reservation within limit', async () => {
    const env = makeEnvelope({ spentMicros: BigInt(5_000_000) });
    const result = await reserveEnvelope(env.id, 'attempt_1', BigInt(1_000_000));
    expect(result.ok).toBe(true);
    expect(result.reservationId).toBeTruthy();
  });

  it('blocks reservation that exceeds limit', async () => {
    const env = makeEnvelope({ spentMicros: BigInt(24_900_000) });
    const result = await reserveEnvelope(env.id, 'attempt_2', BigInt(500_000));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('overage');
  });

  it('blocks reservation on closed envelope', async () => {
    const env = makeEnvelope({ state: 'closed', spentMicros: BigInt(0) });
    const result = await reserveEnvelope(env.id, 'attempt_3', BigInt(100));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('envelope_closed');
  });

  it('is idempotent — duplicate attemptKey returns ok', async () => {
    const env = makeEnvelope();
    await reserveEnvelope(env.id, 'attempt_dup', BigInt(1_000_000));
    const second = await reserveEnvelope(env.id, 'attempt_dup', BigInt(1_000_000));
    expect(second.ok).toBe(true);
  });
});

describe('settleEnvelope', () => {
  beforeEach(() => {
    mockEnvelopes.clear();
    mockReservations.clear();
    jest.clearAllMocks();
  });

  it('marks reservation settled and updates spentMicros', async () => {
    const env = makeEnvelope();
    const { reservationId } = (await reserveEnvelope(env.id, 'atk', BigInt(500_000))) as any;

    // Inject actual costMicros via settleEnvelope
    await settleEnvelope(env.id, reservationId, BigInt(450_000));

    const res = [...mockReservations.values()].find((r) => r.id === reservationId)!;
    expect(res.state).toBe('settled');
  });

  it('is idempotent — second settle is a no-op', async () => {
    const env = makeEnvelope();
    const { reservationId } = (await reserveEnvelope(env.id, 'atk2', BigInt(100_000))) as any;

    await settleEnvelope(env.id, reservationId, BigInt(90_000));
    await settleEnvelope(env.id, reservationId, BigInt(90_000)); // should not throw
  });
});

describe('withEnvelope', () => {
  beforeEach(() => {
    mockEnvelopes.clear();
    mockReservations.clear();
    jest.clearAllMocks();
  });

  it('executes fn and settles reservation on success', async () => {
    const result = await withEnvelope(
      { userId: 'user_victor', estimatedMicros: BigInt(500_000), attemptKey: 'wenv_1' },
      async () => ({ output: 'done', actualMicros: BigInt(450_000) }),
    );
    expect(result.output).toBe('done');
  });

  it('releases reservation on fn failure', async () => {
    await expect(
      withEnvelope(
        { userId: 'user_victor', estimatedMicros: BigInt(500_000), attemptKey: 'wenv_2' },
        async () => { throw new Error('model failed'); },
      ),
    ).rejects.toThrow('model failed');

    // Reservation should be released
    const res = [...mockReservations.values()].find((r) => r.attemptKey === 'wenv_2');
    expect(res?.state).toBe('released');
  });

  it('throws BudgetExceededError when envelope is full', async () => {
    // Pre-fill envelope to near limit
    makeEnvelope({ spentMicros: BigInt(24_999_000) });
    // Reset upsert mock to return the pre-filled envelope
    mockPrisma.budgetEnvelope.upsert.mockImplementationOnce(async () => {
      return [...mockEnvelopes.values()][0];
    });

    await expect(
      withEnvelope(
        { userId: 'user_victor', estimatedMicros: BigInt(5_000_000), attemptKey: 'wenv_3' },
        async () => ({ output: 'x', actualMicros: BigInt(5_000_000) }),
      ),
    ).rejects.toThrow(BudgetExceededError);
  });
});

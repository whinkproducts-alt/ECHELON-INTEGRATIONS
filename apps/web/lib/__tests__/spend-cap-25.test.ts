/**
 * Unit tests for the $25 spend cap in admission.ts
 * Tests the decideAdmission function with spend cap logic.
 */
import { describe, it, expect } from 'vitest';
import { decideAdmission } from '@/lib/model-router/admission';

describe('decideAdmission spend cap tests', () => {
  const baseInput = {
    userId: 'test-user',
    costClass: 'metered' as const,
    priceKnown: true,
    paidAdmitted: true,
    spendCapMicros: 25_000_000,
    reservedTokens: 0,
    reservedMicros: 0,
    tokenUsed: 0,
    tokenReserved: 0,
    tokenLimit: null,
    tokenHardPct: 100,
    spendUsedMicros: 0,
    spendReservedMicros: 0,
    lockedDown: false,
    localOnly: false,
  };

  it('admits when used 24,000,000 + reserved 500,000 + new 500,000 is under cap', () => {
    const result = decideAdmission({
      ...baseInput,
      spendUsedMicros: 24_000_000,
      spendReservedMicros: 500_000,
      reservedMicros: 500_000,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects when used 24,000,000 + reserved 500,000 + new 500,001 exceeds cap', () => {
    const result = decideAdmission({
      ...baseInput,
      spendUsedMicros: 24_000_000,
      spendReservedMicros: 500_000,
      reservedMicros: 500_001,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected spend rejection');
    expect(result.code).toBe('SPEND_HARD_LIMIT');
  });

  it('rejects with SPEND_CAP_UNSET when spendCapMicros is null for metered call', () => {
    const result = decideAdmission({
      ...baseInput,
      spendCapMicros: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected missing-cap rejection');
    expect(result.code).toBe('SPEND_CAP_UNSET');
  });

  it('admits local cost class with no cap set', () => {
    const result = decideAdmission({
      ...baseInput,
      costClass: 'local',
      spendCapMicros: null,
    });
    expect(result.ok).toBe(true);
  });
});

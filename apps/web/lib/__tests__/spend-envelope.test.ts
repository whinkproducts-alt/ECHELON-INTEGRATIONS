import { describe, expect, it } from 'vitest';
import { DEFAULT_ENVELOPE, isRaise, parseEnvelope, usdCaps } from '@/lib/spend-envelope';
import { decideAdmission, type AdmissionDecisionInput } from '@/lib/model-router/admission';

const on = { ...DEFAULT_ENVELOPE, enabled: true };
describe('spend envelope', () => {
  it('converts CAD to USD micros with the rate and is null when off', () => {
    expect(usdCaps(DEFAULT_ENVELOPE)).toBeNull();
    expect(usdCaps({ ...on, cadPerUsd: 1.25 })).toEqual({ dailyMicros: 800_000, monthlyMicros: 16_000_000 });
  });
  it('treats switching on or raising anything as a raise, and lowering or switching off as not', () => {
    expect(isRaise(DEFAULT_ENVELOPE, on)).toBe(true);
    expect(isRaise(on, { ...on, dailyCadMicros: 2_000_000 })).toBe(true);
    expect(isRaise(on, { ...on, cadPerUsd: 1.1 })).toBe(true); // a lower rate means more USD
    expect(isRaise(on, { ...on, monthlyCadMicros: 10_000_000 })).toBe(false);
    expect(isRaise(on, { ...on, enabled: false })).toBe(false);
  });
  it('rejects bad figures', () => {
    for (const bad of [null, {}, { ...on, dailyCadMicros: 0 }, { ...on, dailyCadMicros: 30_000_000 }, { ...on, cadPerUsd: 0 }, { ...on, cadPerUsd: 9 }, { ...on, monthlyCadMicros: 1.5 }])
      expect(parseEnvelope(bad), JSON.stringify(bad)).toBeNull();
    expect(parseEnvelope(on)).toEqual(on);
  });
});

describe('admission with the envelope', () => {
  const base: AdmissionDecisionInput = {
    userId: 'u', costClass: 'metered', priceKnown: true, paidAdmitted: true, spendCapMicros: 14_598_540, reservedTokens: 10, reservedMicros: 100_000,
    tokenUsed: 0, tokenReserved: 0, tokenLimit: null, tokenHardPct: 100, spendUsedMicros: 0, spendReservedMicros: 0, lockedDown: false, localOnly: false,
    dailyCapMicros: 729_927, dailyUsedMicros: 650_000,
  };
  it('stops a call that would pass the daily cap even when the month has room', () => {
    expect(decideAdmission(base)).toEqual({ ok: false, code: 'DAILY_SPEND_LIMIT' });
    expect(decideAdmission({ ...base, dailyUsedMicros: 100_000 })).toEqual({ ok: true });
  });
  it('still enforces the monthly cap and ignores the daily one when no envelope is on', () => {
    expect(decideAdmission({ ...base, dailyCapMicros: null, spendUsedMicros: 14_500_000 })).toEqual({ ok: false, code: 'SPEND_HARD_LIMIT' });
    expect(decideAdmission({ ...base, dailyCapMicros: null })).toEqual({ ok: true });
  });
});

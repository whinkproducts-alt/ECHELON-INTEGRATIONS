import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  classifyCost,
  classifyVoice,
  conservativeTokens,
  decideAdmission,
  DispatchBlockedError,
  endpointIsLocal,
  openHoldWhere,
  spendCapMicros,
} from '@/lib/model-router/admission';

const reason = (r: { ok: true } | { ok: false; code: string }) => (r.ok ? 'OK' : r.code);
const env = (o: Record<string, string>) => ({ ...process.env, ...o });

const base = {
  userId: 'user-a',
  costClass: 'local' as const,
  priceKnown: false,
  paidAdmitted: false,
  spendCapMicros: null,
  reservedTokens: 10,
  reservedMicros: 0,
  tokenUsed: 0,
  tokenReserved: 0,
  tokenLimit: null as number | null,
  tokenHardPct: 100,
  spendUsedMicros: 0,
  spendReservedMicros: 0,
  lockedDown: false,
  localOnly: false,
};

describe('dispatch admission policy', () => {
  it('refuses a missing account, a trial model, and an unknown remote cost', () => {
    expect(reason(decideAdmission({ ...base, userId: '' }))).toBe('MISSING_ACCOUNT');
    expect(reason(decideAdmission({ ...base, costClass: 'trial' }))).toBe('TRIAL_NOT_ADMITTED');
    expect(reason(decideAdmission({ ...base, costClass: 'unknown' }))).toBe('UNKNOWN_COST');
    expect(classifyCost({ model: 'nvidia/nemotron-3-ultra' })).toBe('trial');
    expect(classifyCost({ model: 'llama3.1:8b', baseUrl: 'https://api.example.test/v1' })).toBe('unknown');
    expect(classifyCost({ model: 'llama3.1:8b' })).toBe('local');
  });

  it('a BYOK key and an unset or zero cap do not authorize paid dispatch', () => {
    expect(spendCapMicros({ WHINK_MONTHLY_SPEND_MICROS: '0' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(spendCapMicros({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    const paid = { ...base, costClass: 'metered' as const, priceKnown: true, reservedMicros: 1, spendCapMicros: 100 };
    expect(reason(decideAdmission({ ...paid, paidAdmitted: false }))).toBe('PAID_NOT_ADMITTED');
    expect(reason(decideAdmission({ ...paid, paidAdmitted: true, priceKnown: false }))).toBe('UNKNOWN_PRICE');
    expect(reason(decideAdmission({ ...paid, paidAdmitted: true, spendCapMicros: null }))).toBe('SPEND_CAP_UNSET');
    expect(reason(decideAdmission({ ...paid, paidAdmitted: true, spendCapMicros: 0 }))).toBe('SPEND_CAP_UNSET');
    expect(reason(decideAdmission({ ...paid, paidAdmitted: true, spendUsedMicros: 100 }))).toBe('SPEND_HARD_LIMIT');
    expect(decideAdmission({ ...paid, paidAdmitted: true })).toEqual({ ok: true });
  });

  it('local unlimited tokens are allowed, and the last token of a hard cap is exclusive', () => {
    expect(decideAdmission(base)).toEqual({ ok: true });
    expect(decideAdmission({ ...base, tokenLimit: 100, tokenUsed: 90, reservedTokens: 10 })).toEqual({ ok: true });
    expect(reason(decideAdmission({ ...base, tokenLimit: 100, tokenUsed: 91, reservedTokens: 10 }))).toBe('TOKEN_HARD_LIMIT');
  });

  it('lockdown and local-only refuse anything that is not on this machine', () => {
    expect(decideAdmission({ ...base, lockedDown: true })).toEqual({ ok: true });
    expect(reason(decideAdmission({ ...base, lockedDown: true, costClass: 'metered', paidAdmitted: true, priceKnown: true, spendCapMicros: 10, reservedMicros: 1 }))).toBe('LOCKDOWN');
    expect(reason(decideAdmission({ ...base, localOnly: true, costClass: 'unknown' }))).toBe('LOCAL_ONLY');
  });

  it('voice cloud without a known price is metered, and loopback speech is local', () => {
    expect(classifyVoice({ channel: 'tts', env: env({ TTS_PROVIDER: 'openai' }) })).toBe('metered');
    expect(classifyVoice({ channel: 'stt', env: env({ STT_PROVIDER: 'deepgram' }) })).toBe('metered');
    expect(classifyVoice({ channel: 'tts', env: env({ TTS_URL: 'http://127.0.0.1:8766' }) })).toBe('local');
    expect(classifyVoice({ channel: 'stt', env: env({ STT_URL: 'https://speech.example.test' }) })).toBe('unknown');
    expect(endpointIsLocal('http://localhost.evil.com/v1')).toBe(false);
  });

  it('overflow is a refusal, and open holds are not filtered by month', () => {
    expect(() => conservativeTokens(1, 2_000_000_000)).toThrow(DispatchBlockedError);
    expect(openHoldWhere('user-a')).toEqual({ userId: 'user-a', state: { in: ['reserved', 'held'] } });
    expect(JSON.stringify(openHoldWhere('user-a'))).not.toContain('createdAt');
  });
});

describe('production dispatch cannot skip admission', () => {
  const root = path.resolve(__dirname, '../..');
  const files = [
    'lib/tool-loop.ts',
    'lib/worker/context.ts',
    'lib/auto-memory.ts',
    'lib/orchestrator.ts',
    'lib/tool-registry.ts',
    'lib/skills/model.ts',
    'lib/swarm/planner.ts',
    'lib/swarm/agent-call.ts',
    'lib/change-requests/refine.ts',
    'lib/embedding-service.ts',
    'app/api/voice/stt/route.ts',
    'app/api/voice/tts/route.ts',
  ];
  it('each production caller admits before transport', () => {
    for (const file of files) {
      const src = readFileSync(path.join(root, file), 'utf8');
      expect(src, file).toMatch(/admittedChatOnce|admittedCall|admittedEmbed|runAdmittedVoice|reserveLocalAnalysis|reserveDispatch/);
      if (file !== 'lib/tool-loop.ts') expect(src, file).not.toMatch(/\bchatOnce\(/);
    }
  });
});

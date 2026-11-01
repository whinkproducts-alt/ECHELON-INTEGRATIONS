import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/prompts/build-prompt';
import { PROTECTED_ACTIONS_POLICY } from '@/prompts/security-policy';

describe('protected-actions instruction in the system prompt', () => {
  it.each([
    [{ persona: 'WHINK' }],
    [{ persona: 'MAMBA', mambaMode: 'OBSIDIAN' }],
    [{ persona: 'MAMBA' }],
    [{ persona: 'PETER' }],
    [{ persona: 'PAUL' }],
    [{ persona: 'MICAH' }],
    [{ persona: 'NANDI' }],
    [{ persona: 'SCOUT' }],
  ])('is present for %o', (ctx) => {
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain(PROTECTED_ACTIONS_POLICY);
    expect(prompt).toMatch(/money/);
    expect(prompt).toMatch(/explicit approval through the approval card/);
    expect(prompt).toMatch(/Never claim such an action was done/);
    expect(prompt).toMatch(/Never suggest, encourage or help bypass/);
  });

  it('comes before the persona layer so a persona cannot override it', () => {
    const prompt = buildSystemPrompt({ persona: 'MAMBA' });
    expect(prompt.indexOf(PROTECTED_ACTIONS_POLICY)).toBeLessThan(prompt.indexOf('ACTIVE PERSONA: MAMBA'));
  });

  it.each([['PETER', 'Principal Reverse Engineer'], ['PAUL', 'Principal Reconstruction Engineer']])('%s loads its dedicated evidence protocol', (persona, role) => {
    const prompt = buildSystemPrompt({ persona });
    expect(prompt).toContain(role);
    expect(prompt).toContain('ABSOLUTE NO-HALLUCINATION PROTOCOL');
    expect(prompt).toContain('UNCONFIRMED');
  });

  it.each([['MICAH', 'Principal Product Auditor'], ['NANDI', 'Growth, Marketing, Conversion & Revenue Strategist'], ['SCOUT', 'Master Researcher & Opportunity Intelligence Scout']])('%s loads its dedicated evidence protocol', (persona, role) => {
    const prompt = buildSystemPrompt({ persona });
    expect(prompt).toContain(role);
    expect(prompt).toContain('ABSOLUTE NO-HALLUCINATION PROTOCOL');
    expect(prompt).toContain('UNCONFIRMED');
  });
});

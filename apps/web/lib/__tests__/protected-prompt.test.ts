import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/prompts/build-prompt';
import { PROTECTED_ACTIONS_POLICY } from '@/prompts/security-policy';

describe('protected-actions instruction in the system prompt', () => {
  it.each([
    [{ persona: 'WHINK' }],
    [{ persona: 'MAMBA', mambaMode: 'OBSIDIAN' }],
    [{ persona: 'MAMBA' }],
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
});

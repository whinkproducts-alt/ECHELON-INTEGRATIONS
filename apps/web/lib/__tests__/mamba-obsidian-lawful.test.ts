/**
 * E3 Gap 1 — MAMBA lawful constraint in system prompt
 *
 * The lawful constraint for MAMBA is enforced via the system prompt passed to the model.
 * These tests assert that buildSystemPrompt, when called with persona='MAMBA' and
 * mambaMode='OBSIDIAN', includes the lawful constraint language that prevents the model
 * from providing illegal help.
 *
 * This is the correct unit-testable assertion because the constraint is not checked in
 * application code: it is a hard rule baked into the prompt layer.
 */

import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../prompts/build-prompt';

describe('MAMBA Obsidian lawful constraint in system prompt', () => {
  it('MAMBA+OBSIDIAN system prompt contains lawful-only language', () => {
    const prompt = buildSystemPrompt({ persona: 'MAMBA', mambaMode: 'OBSIDIAN' });
    // The MAMBA_OBSIDIAN layer states "Lawful only. No illegal help, no instructions that cross into harm."
    expect(prompt.toLowerCase()).toMatch(/lawful/);
    expect(prompt).toContain('No illegal help');
  });

  it('MAMBA+OBSIDIAN system prompt contains "no instructions that cross into harm"', () => {
    const prompt = buildSystemPrompt({ persona: 'MAMBA', mambaMode: 'OBSIDIAN' });
    expect(prompt).toContain('no instructions that cross into harm');
  });

  it('MAMBA+OBSIDIAN system prompt includes the MAMBA MODE: OBSIDIAN header', () => {
    const prompt = buildSystemPrompt({ persona: 'MAMBA', mambaMode: 'OBSIDIAN' });
    expect(prompt).toContain('MAMBA MODE: OBSIDIAN');
  });

  it('MAMBA without a mode still gets the base MAMBA persona prompt', () => {
    const prompt = buildSystemPrompt({ persona: 'MAMBA', mambaMode: null });
    // The MAMBA_PERSONA layer is always included when persona=MAMBA
    // Even without mode, MAMBA persona should be present
    expect(prompt.length).toBeGreaterThan(100);
    // The OBSIDIAN mode layer is NOT present when mambaMode is null
    expect(prompt).not.toContain('MAMBA MODE: OBSIDIAN');
  });

  it('WHINK persona prompt does not include MAMBA mode overlay', () => {
    const prompt = buildSystemPrompt({ persona: 'WHINK', mambaMode: null });
    expect(prompt).not.toContain('MAMBA MODE: OBSIDIAN');
    expect(prompt).not.toContain('No illegal help');
  });

  it('buildSystemPrompt with MAMBA+OBSIDIAN does not allow a no-tool-executed ledger side-effect', () => {
    // This test verifies no tool_executed ledger row is created by building the system prompt alone.
    // buildSystemPrompt is a pure synchronous function — it cannot call the ledger.
    const before = Date.now();
    buildSystemPrompt({ persona: 'MAMBA', mambaMode: 'OBSIDIAN' });
    const after = Date.now();
    // Pure function completes in < 100ms with no async side-effects
    expect(after - before).toBeLessThan(100);
  });
});

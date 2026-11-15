import { describe, it, expect, afterEach } from 'vitest';
import { runTaskGate, isReadOnlyDirective } from '@/lib/task-gate';

const READ = 'Research the competitive landscape for our product roadmap this quarter';
const SEND = 'Draft the investor deck and email it to our product investors this week';
const BUILD = 'Build the new marketing funnel for the product launch next month please';

afterEach(() => { delete process.env.WHINK_TASK_GATE_ANALYSIS_AUTO; });

describe('task gate', () => {
  it('default: intercepts every directive, read-only or not', () => {
    for (const m of [READ, SEND, BUILD]) expect(runTaskGate(m).intercepted, m).toBe(true);
  });

  it('opt-in: a read-only directive passes through, anything with a side effect is still intercepted', () => {
    process.env.WHINK_TASK_GATE_ANALYSIS_AUTO = 'true';
    expect(runTaskGate(READ).intercepted).toBe(false);
    expect(runTaskGate(SEND).intercepted).toBe(true);
    expect(runTaskGate(BUILD).intercepted).toBe(true);
  });

  it('opt-in is exactly the string "true"', () => {
    process.env.WHINK_TASK_GATE_ANALYSIS_AUTO = '1';
    expect(runTaskGate(READ).intercepted).toBe(true);
  });

  it('money and send words always keep the gate, even behind a read-only opener', () => {
    for (const m of ['Review the contract then pay the invoice for the vendor today', 'Research the vendors and wire the deposit to them now', 'Write a summary and post it to the company page today']) {
      expect(isReadOnlyDirective(m), m).toBe(false);
    }
  });

  it('short messages and plain questions are never directives', () => {
    expect(runTaskGate('Research this').intercepted).toBe(false);
    expect(runTaskGate('What is on my calendar today').intercepted).toBe(false);
  });
});

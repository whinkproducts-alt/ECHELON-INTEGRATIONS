import { describe, it, expect } from 'vitest';
import {
  classifySpokenDecision, buildApprovalPrompt, generateConfirmationCode,
} from '@/lib/spoken-approval';

const CODE = '4719';

describe('classifySpokenDecision', () => {
  it.each([
    ['no don\'t do it', 0.95, 'deny'],
    ["don't approve", 0.95, 'deny'],
    ['Do NOT approve 4719', 0.95, 'deny'],
    ['yesterday', 0.95, 'unclear'],
    ['yes', 0.95, 'unclear'],
    ['confirm', 0.95, 'unclear'],
    ['go ahead and approve 4719 please', 0.95, 'unclear'],
    ['approve 4719', 0.9, 'approve'],
    ['Approved, 4719.', 0.9, 'approve'],
    ['approve 4 7 1 9', 0.9, 'approve'],
    ['approve four seven one nine', 0.9, 'approve'],
    ['approve 4719', 0.5, 'unclear'],
    ['approve 4718', 0.9, 'unclear'],
    ['approve', 0.9, 'unclear'],
    ['approve 4719 no wait', 0.9, 'deny'],
    ['deny', 0.1, 'deny'],
    ['know', 0.9, 'unclear'],
    ['', 0.9, 'unclear'],
  ])('%s (conf %s) -> %s', (said, conf, want) => {
    expect(classifySpokenDecision(said, conf, CODE)).toBe(want);
  });

  it('never approves with a malformed expected code', () => {
    expect(classifySpokenDecision('approve 12', 0.99, '12')).toBe('unclear');
  });
});

describe('approval prompt and code', () => {
  it('never contains the confirmation code', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateConfirmationCode();
      expect(code).toMatch(/^\d{4}$/);
      const text = buildApprovalPrompt({ tool: 'send_email', summary: 'Send a note to the team' });
      expect(text).not.toContain(code);
      expect(text).not.toMatch(/\b\d{4}\b/);
    }
  });

  it('tells the user to use the on-screen code', () => {
    expect(buildApprovalPrompt({ tool: null, summary: 'x' })).toContain('code on screen');
  });
});

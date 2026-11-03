import { describe, expect, it } from 'vitest';
import { budgetConversation, charBudget } from '../model-router/context-budget';
describe('deterministic context budget', () => {
  it('drops oldest whole exchanges and preserves system rules plus current request', () => {
    const messages = [
      { role: 'system' as const, content: 'never send secrets' },
      { role: 'user' as const, content: 'old'.repeat(100) },
      { role: 'assistant' as const, content: 'answer'.repeat(100) },
      { role: 'user' as const, content: 'current request' },
    ];
    const r = budgetConversation(messages, 100);
    expect(r.messages).toEqual([messages[0], messages[3]]);
    expect(r.omittedMessages).toBe(2);
    expect(r.retainedChars).toBeLessThan(r.originalChars);
    expect(messages).toHaveLength(4);
  });
  it('never cuts a required instruction or oversized latest user request', () => {
    const messages = [{ role: 'system' as const, content: 'RULE'.repeat(100) }, { role: 'user' as const, content: 'code'.repeat(100) }];
    expect(budgetConversation(messages, 10)).toMatchObject({ messages, mandatoryOverTarget: true, omittedMessages: 0 });
  });
  it('preserves multiple system instructions and contiguous recent complete exchanges', () => {
    const messages = [{ role: 'system' as const, content: 'a' }, { role: 'system' as const, content: 'b' },
      { role: 'user' as const, content: 'c' }, { role: 'assistant' as const, content: 'd' }, { role: 'user' as const, content: 'e' }];
    expect(budgetConversation(messages, 5).messages).toEqual(messages);
  });
  it('uses safe defaults for malformed, tiny, excessive or non-finite settings', () => {
    for (const value of ['NaN', '-1', '1', '999999999', '1e9']) expect(charBudget('TEST', 8000, { TEST: value })).toBe(8000);
    expect(charBudget('TEST', 8000, { TEST: '16000' })).toBe(16000);
  });
});

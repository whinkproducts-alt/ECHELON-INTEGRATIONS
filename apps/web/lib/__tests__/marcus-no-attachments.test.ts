import { describe, it, expect } from 'vitest';
import { attachmentKeys } from '@/lib/safety/marcus-no-attachments';
describe('Marcus tasks carry no attachments', () => {
  it('flags attachment-like keys in any case', () => {
    expect(attachmentKeys({ title: 't', Attachments: [], MEMORY: 'x' })).toEqual(['attachments', 'memory']);
  });
  it('a plain task passes; junk bodies pass through to normal validation', () => {
    expect(attachmentKeys({ title: 't', goal: 'g', deadline: null })).toEqual([]);
    expect(attachmentKeys(null)).toEqual([]);
  });
});

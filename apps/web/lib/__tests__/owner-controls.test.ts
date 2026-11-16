import { describe, it, expect } from 'vitest';
import { parseProgramList } from '@/lib/owner-controls';

describe('parseProgramList', () => {
  it('splits, trims and dedupes bare names', () => {
    expect(parseProgramList('ls, cat  ls\nhead')).toEqual({ ok: true, programs: ['ls', 'cat', 'head'] });
  });
  it('rejects paths and shell symbols', () => {
    expect(parseProgramList('/bin/ls').ok).toBe(false);
    expect(parseProgramList('ls;rm').ok).toBe(false);
  });
  it('rejects more than 50', () => {
    expect(parseProgramList(Array.from({ length: 51 }, (_, i) => `p${i}`).join(' ')).ok).toBe(false);
  });
  it('empty clears the list', () => {
    expect(parseProgramList('  ')).toEqual({ ok: true, programs: [] });
  });
});

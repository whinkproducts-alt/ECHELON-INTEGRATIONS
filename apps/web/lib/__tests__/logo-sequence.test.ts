import { describe, it, expect } from 'vitest';
import { logoBag } from '../brand/logo-sequence';

describe('official identity shuffle', () => {
  it('uses all eight once and prevents repeats across bag boundaries', () => {
    let previous = -1;
    for (let cycle = 0; cycle < 20; cycle++) {
      const bag = logoBag(8, previous);
      expect(new Set(bag).size).toBe(8);
      expect([...bag].sort()).toEqual([0,1,2,3,4,5,6,7]);
      expect(bag[0]).not.toBe(previous);
      previous = bag[7];
    }
  });
  it('handles one configured mark', () => expect(logoBag(1, 0)).toEqual([0]));
});

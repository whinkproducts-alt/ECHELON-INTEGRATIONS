import { describe, it, expect } from 'vitest';
import { parseScheduleInput } from '@/lib/social/scheduler';

const now = new Date('2026-10-03T12:00:00Z');
const base = { platform: 'x', text: 'hello', send_at: '2026-10-04T12:00:00-06:00' };

describe('parseScheduleInput', () => {
  it('normalises to canonical params: only the approved fields, ISO UTC time', () => {
    const r = parseScheduleInput({ ...base, extra: 'ignored', tool: 'openclaw__x__delete_post' }, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ platform: 'x', tool: 'openclaw__x__post', args: { text: 'hello' }, send_at: '2026-10-04T18:00:00.000Z' });
    }
  });
  it.each([
    [{ ...base, platform: 'tiktok' }],
    [{ ...base, text: '' }],
    [{ ...base, text: '   ' }],
    [{ ...base, text: 'a'.repeat(281) }],
    [{ ...base, text: 5 }],
    [{ ...base, send_at: 'tomorrow' }],
    [{ ...base, send_at: '2026-10-03T11:59:59Z' }],
    [{ ...base, send_at: '2028-10-03T12:00:00Z' }],
    [null],
    [[]],
  ])('rejects %j', (input) => {
    expect(parseScheduleInput(input, now).ok).toBe(false);
  });
});

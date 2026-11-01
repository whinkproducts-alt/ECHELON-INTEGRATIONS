import { describe, it, expect } from 'vitest';
import { exposeName, assignNames } from '../src/namespace.js';

describe('exposeName', () => {
  it('prefixes with the platform', () => {
    expect(exposeName('ref', 'echo')).toEqual({ ok: true, name: 'ref__echo' });
  });
  it('maps hyphens and case, nothing else', () => {
    expect(exposeName('ref', 'Get-Sum')).toEqual({ ok: true, name: 'ref__get_sum' });
    expect(exposeName('ref', 'bad name').ok).toBe(false);
    expect(exposeName('ref', 'dot.name').ok).toBe(false);
    expect(exposeName('ref', '').ok).toBe(false);
  });
  it('rejects, never truncates, names whose full WHINK name exceeds 64', () => {
    // 'openclaw__' (10) + 'ref__' (5) + body
    expect(exposeName('ref', 'a'.repeat(49)).ok).toBe(true);
    expect(exposeName('ref', 'a'.repeat(50)).ok).toBe(false);
  });
});

describe('assignNames', () => {
  it('rejects every tool in a collision', () => {
    const r = assignNames('ref', [{ name: 'get-sum' }, { name: 'get_sum' }, { name: 'ok' }]);
    expect(r.accepted.map((a) => a.exposed)).toEqual(['ref__ok']);
    expect(r.rejected.map((x) => x.reason)).toEqual(['name collision', 'name collision']);
  });
  it('remembers the original name for forwarding', () => {
    const r = assignNames('ref', [{ name: 'Get-Sum' }]);
    expect(r.accepted[0]).toMatchObject({ exposed: 'ref__get_sum', original: 'Get-Sum' });
  });
});

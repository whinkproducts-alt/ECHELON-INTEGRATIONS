import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getSubsidiaries, getSubsidiary, isSubsidiaryId, SUBSIDIARY_IDS } from '../subsidiaries';
import board from '../../config/board.json';

const pub = (p: string) => path.join(__dirname, '../../public', p);

describe('subsidiaries config', () => {
  it('has the five ids, unique, in order', () => {
    const ids = getSubsidiaries().map((s) => s.id);
    expect(ids).toEqual(['consult', 'real-estate', 'trades', 'apps', 'frontliners']);
    expect(new Set(ids).size).toBe(5);
    expect([...SUBSIDIARY_IDS]).toEqual(ids);
  });
  it('every logo and director image exists under public/', () => {
    for (const s of getSubsidiaries()) {
      expect(fs.existsSync(pub(s.logo)), s.logo).toBe(true);
      for (const d of s.directors) if (d.imageUrl) expect(fs.existsSync(pub(d.imageUrl)), d.imageUrl).toBe(true);
    }
  });
  it('every boardId exists in config/board.json', () => {
    const boardIds = new Set((board as { members: Array<{ id: string }> }).members.map((m) => m.id));
    for (const s of getSubsidiaries()) for (const d of s.directors) if (d.boardId) expect(boardIds.has(d.boardId), d.boardId).toBe(true);
  });
  it('lookup helpers', () => {
    expect(isSubsidiaryId('apps')).toBe(true);
    expect(isSubsidiaryId('unassigned')).toBe(false);
    expect(isSubsidiaryId(5)).toBe(false);
    expect(getSubsidiary('nope')).toBeNull();
    expect(getSubsidiary('frontliners')?.location).toBe('Nigeria');
    expect(getSubsidiary('apps')?.services).toEqual([]);
    expect(getSubsidiary('trades')?.notice).toMatch(/no longer accepting investors/);
  });
});

describe('permission registry', () => {
  it('registers project_create and project_update as Class A', async () => {
    const { capabilityClass } = await import('../permission-engine');
    expect(capabilityClass('project_update')).toBe('A');
    expect(capabilityClass('project_create')).toBe('A');
  });
});

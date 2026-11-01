import { describe, it, expect } from 'vitest';
import { STAFF_DIRECTORY, STAFF_EMAIL_RE, staffEmail, getStaffByEmail } from '../staff-directory';

describe('staff directory', () => {
  it('ids and emails are unique', () => {
    expect(new Set(STAFF_DIRECTORY.map((s) => s.id)).size).toBe(STAFF_DIRECTORY.length);
    expect(new Set(STAFF_DIRECTORY.map((s) => s.email)).size).toBe(STAFF_DIRECTORY.length);
  });
  it('every email matches the format and the name', () => {
    for (const s of STAFF_DIRECTORY) {
      expect(s.email).toMatch(STAFF_EMAIL_RE);
      expect(s.email).toBe(staffEmail(s.firstName, s.lastName));
    }
  });
  it('keeps Victor and Marcus exactly, as humans', () => {
    expect(getStaffByEmail('victor.igboekwe@whinkgroup.com')).toMatchObject({ role: 'Founder & CEO', kind: 'human' });
    expect(getStaffByEmail('marcus.vale@whinkgroup.com')).toMatchObject({ role: 'Executive Assistant', kind: 'human' });
    expect(STAFF_DIRECTORY.filter((s) => s.kind === 'human')).toHaveLength(2);
  });
  it('no placeholder role names remain as people names', () => {
    for (const s of STAFF_DIRECTORY) {
      expect(`${s.firstName} ${s.lastName}`).not.toMatch(/lead|scout|analyst|strategist|innovation/i);
    }
    expect(STAFF_DIRECTORY.filter((s) => s.kind === 'agent')).toHaveLength(5);
  });
  it('handles apostrophes, hyphens and diacritics', () => {
    expect(staffEmail('Soren', "O'Connell")).toBe('soren.oconnell@whinkgroup.com');
    expect(staffEmail('Mei-Ling', 'Tan')).toBe('mei-ling.tan@whinkgroup.com');
    expect(staffEmail('José', 'Núñez')).toBe('jose.nunez@whinkgroup.com');
  });
  it('reportsTo references existing ids', () => {
    const ids = new Set(STAFF_DIRECTORY.map((s) => s.id));
    for (const s of STAFF_DIRECTORY) if (s.reportsTo) expect(ids.has(s.reportsTo)).toBe(true);
  });
});

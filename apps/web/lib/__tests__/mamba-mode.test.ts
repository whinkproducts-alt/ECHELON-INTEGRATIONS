import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { normaliseMambaMode } from '../types';

describe('normaliseMambaMode', () => {
  it('collapses legacy modes to OBSIDIAN for MAMBA', () => {
    expect(normaliseMambaMode('WHITE', 'MAMBA')).toBe('OBSIDIAN');
    expect(normaliseMambaMode('GREY', 'MAMBA')).toBe('OBSIDIAN');
    expect(normaliseMambaMode(undefined, 'MAMBA')).toBe('OBSIDIAN');
  });
  it('garbage values collapse to OBSIDIAN for MAMBA and null for WHINK', () => {
    for (const g of ['purple', 'obsidian', 42, {}, [], true, 'DROP TABLE']) {
      expect(normaliseMambaMode(g, 'MAMBA')).toBe('OBSIDIAN');
      expect(normaliseMambaMode(g, 'WHINK')).toBeNull();
    }
  });
  it('is null for WHINK regardless of input', () => {
    expect(normaliseMambaMode('OBSIDIAN', 'WHINK')).toBeNull();
    expect(normaliseMambaMode('WHITE', 'WHINK')).toBeNull();
  });
  it('without persona: any value becomes OBSIDIAN, empty becomes null', () => {
    expect(normaliseMambaMode('GREY')).toBe('OBSIDIAN');
    expect(normaliseMambaMode(null)).toBeNull();
    expect(normaliseMambaMode('')).toBeNull();
  });
  it('has a data migration for legacy values', () => {
    const dir = path.resolve(__dirname, '../../prisma/migrations');
    const found = fs.readdirSync(dir).filter((d) => d.includes('mamba_obsidian_only'));
    expect(found.length).toBe(1);
    const sql = fs.readFileSync(path.join(dir, found[0], 'migration.sql'), 'utf8');
    for (const t of ['persona_states', 'messages', 'hypotheses', 'actions']) expect(sql).toContain(`"${t}"`);
  });
});

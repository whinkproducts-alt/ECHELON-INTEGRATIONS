import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { validateKpi } from '@/lib/org/kpi';
import { attainment, meets } from '@/lib/org/measures';
import { lastWindow } from '@/lib/org/scoring';
import { scoreScenarios } from '@/lib/org/training';
import { proposalHash } from '@/lib/org/promotion';

describe('KPI rules', () => {
  const ok = { entityKey: 'x', measureCode: 'rework_rate', target: 0.1, weight: 0.5, periodDays: 30 };
  it('accepts only fixed measure codes and sane numbers', () => {
    expect(validateKpi(ok)).toBeNull();
    expect(validateKpi({ ...ok, measureCode: 'SELECT 1' })).toMatch(/unknown/);
    expect(validateKpi({ ...ok, weight: 0 })).toMatch(/weight/);
    expect(validateKpi({ ...ok, weight: 1.5 })).toMatch(/weight/);
    expect(validateKpi({ ...ok, target: -1 })).toMatch(/target/);
    expect(validateKpi({ ...ok, periodDays: 3 })).toMatch(/period/);
  });
  it('respects direction and gives no verdict without evidence', () => {
    expect(meets('task_completion_rate', 0.9, 0.8)).toBe(true);
    expect(meets('rework_rate', 0.3, 0.1)).toBe(false);
    expect(meets('rework_rate', null, 0.1)).toBeNull();
    expect(attainment('task_completion_rate', 0.4, 0.8)).toBe(0.5);
    expect(attainment('rework_rate', 0.2, 0.1)).toBe(0.5);
  });
  it('windows are completed, aligned and adjacent', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    const w = lastWindow(now, 30);
    expect(w.to.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(w.to.getTime() - w.from.getTime()).toBe(30 * 86_400_000);
  });
  it('promotion hash changes with content', () => {
    const p = { entityKey: 'a', kind: 'promote', toRole: 'r', changesAccess: false };
    expect(proposalHash(p)).not.toBe(proposalHash({ ...p, toRole: 'r2' }));
    expect(proposalHash(p)).toHaveLength(64);
  });
});

describe('training scenario pass check', () => {
  const sc = [{ id: 'a', prompt: 'p', mustMention: ['approval'], mustNotMention: ['skip'] }, { id: 'b', prompt: 'p', mustMention: ['Victor'] }];
  it('passes at the owner pass mark only', () => {
    expect(scoreScenarios(sc, { a: 'Needs approval', b: 'ask victor' }, 1)).toEqual({ score: 1, passed: true });
    expect(scoreScenarios(sc, { a: 'skip approval', b: 'victor' }, 1).passed).toBe(false);
    expect(scoreScenarios(sc, { a: 'skip approval', b: 'victor' }, 0.5).passed).toBe(true);
    expect(scoreScenarios([], {}, 0.1).passed).toBe(false);
  });
});

describe('tamper rule', () => {
  const root = path.resolve(__dirname, '../..');
  function walk(d: string, out: string[] = []): string[] {
    for (const f of readdirSync(d)) {
      if (f === 'node_modules' || f === '.next' || f === '__tests__') continue;
      const p = path.join(d, f);
      statSync(p).isDirectory() ? walk(p, out) : /\.(ts|tsx)$/.test(f) && out.push(p);
    }
    return out;
  }
  it('only lib/org/scoring.ts writes KPI scores', () => {
    const bad = walk(root).filter((f) => /orgKpiScore\.(create|createMany|update|updateMany|upsert|delete|deleteMany)/.test(readFileSync(f, 'utf-8')) && !f.endsWith(path.join('lib', 'org', 'scoring.ts')));
    expect(bad).toEqual([]);
  });
  it('only lib/org/kpi.ts writes KPI definitions', () => {
    const bad = walk(root).filter((f) => /orgKpi\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(readFileSync(f, 'utf-8')) && !f.endsWith(path.join('lib', 'org', 'kpi.ts')));
    expect(bad).toEqual([]);
  });
});

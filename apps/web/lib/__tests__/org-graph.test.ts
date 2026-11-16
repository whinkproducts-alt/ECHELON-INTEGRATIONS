import { describe, expect, it } from 'vitest';
import { approvalChain, buildOrg, FOUNDER_KEY, validateOrg, type OrgNode } from '@/lib/org/graph';

describe('org graph from org-kit', () => {
  const nodes = buildOrg();
  it('is valid: one manager each, no loops, depth capped', () => {
    expect(validateOrg(nodes)).toEqual([]);
    expect(nodes.filter((n) => n.kind === 'agent')).toHaveLength(338);
    expect(nodes.filter((n) => n.tier === 0)).toHaveLength(1);
  });
  it('rejects loops, missing managers and orphans', () => {
    const a: OrgNode = { key: 'a', kind: 'human', name: 'a', role: 'r', tier: 3, directorate: null, department: null, managerKey: 'b', roles: [] };
    const b = { ...a, key: 'b', managerKey: 'a' };
    const f = { ...a, key: FOUNDER_KEY, tier: 0 as const, managerKey: null };
    expect(validateOrg([f, a, b]).some((e) => e.startsWith('loop'))).toBe(true);
    expect(validateOrg([f, { ...a, managerKey: null }])).toContain('a has no manager');
    expect(validateOrg([f, { ...a, managerKey: 'zz' }])[0]).toMatch(/not found/);
  });
  it('approval chain: manager then manager\'s manager; Marcus founder alone; access adds founder', () => {
    const agent = nodes.find((n) => n.kind === 'agent')!;
    const mgr = nodes.find((n) => n.key === agent.managerKey)!;
    expect(approvalChain(nodes, agent.key)).toEqual([mgr.key, mgr.managerKey!]);
    expect(approvalChain(nodes, 'marcus-vale')).toEqual([FOUNDER_KEY]);
    expect(approvalChain(nodes, agent.key, true)).toContain(FOUNDER_KEY);
    expect(approvalChain(nodes, 'whitney-brown')).toEqual([FOUNDER_KEY]); // manager is founder, who has no manager: deduped
  });
});

import { describe, it, expect } from 'vitest';
import { loadOrgKit, type OrgAgent, type OrgKit } from '../agent-loader';
import { makeRoutable } from '../agent-validator';
import { SkillRegistry } from '../skill-registry';
import { LoadBalancer } from '../load-balancer';
import { Router } from '../routing-algorithm';
import { buildValidatedDirectory } from '../gesture/agent-directory';

async function kitWith(mutate: (a: OrgAgent) => OrgAgent): Promise<{ kit: OrgKit; badId: string; goodId: string }> {
  const kit = await loadOrgKit();
  const bad = mutate({ ...kit.agents[0] });
  kit.agents = [bad, ...kit.agents.slice(1)];
  return { kit, badId: bad.agent_id, goodId: kit.agents[1].agent_id };
}

describe('agent validator is enforced at runtime', () => {
  const cases: Array<[string, (a: OrgAgent) => OrgAgent]> = [
    ['autonomy 10', (a) => ({ ...a, autonomy_level: 10 })],
    ['unknown permission "execute"', (a) => ({ ...a, permissions: [...a.permissions, 'execute'] })],
    ['wildcard data_access', (a) => ({ ...a, data_access: ['*'] })],
  ];

  for (const [label, mutate] of cases) {
    it(`directory hides and router will not route an agent with ${label}`, async () => {
      const { kit, badId, goodId } = await kitWith(mutate);

      const dir = buildValidatedDirectory(kit);
      expect(dir.get(badId)).toBeNull();
      expect(dir.rejected.has(badId)).toBe(true);
      expect(dir.get(goodId)).not.toBeNull();

      const registry = SkillRegistry.build(kit.skills, kit.agents); // deliberately includes the bad agent
      const router = new Router(registry, new LoadBalancer(), makeRoutable(kit));
      const skills = kit.agents[0].skills.slice(0, 1);
      const d = router.route({ accountId: 'a1', requiredSkills: skills });
      expect(d.candidates.find((c) => c.agentId === badId)).toBeUndefined();
    });
  }

  it('Router construction fails without a routable argument', async () => {
    const kit = await loadOrgKit();
    const registry = SkillRegistry.build(kit.skills, kit.agents);
    // @ts-expect-error routable is required
    expect(() => new Router(registry, new LoadBalancer())).toThrow(/routable/);
  });
});

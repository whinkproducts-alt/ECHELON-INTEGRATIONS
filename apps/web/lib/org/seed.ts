import { prisma } from '@/lib/db';
import { buildOrg, validateOrg } from '@/lib/org/graph';

/** Idempotent. Seeds from packages/org-kit only; refuses to write if the graph is invalid. */
export async function seedOrg(userId: string): Promise<{ entities: number }> {
  const nodes = buildOrg();
  const errs = validateOrg(nodes);
  if (errs.length) throw new Error(`org invalid: ${errs.slice(0, 5).join('; ')}`);
  await prisma.$transaction(nodes.map((n) => {
    const data = { kind: n.kind, name: n.name, role: n.role, tier: n.tier, directorate: n.directorate, department: n.department, managerKey: n.managerKey, roles: n.roles };
    return prisma.orgEntity.upsert({ where: { userId_key: { userId, key: n.key } }, create: { userId, key: n.key, ...data }, update: data });
  }));
  return { entities: nodes.length };
}

export async function loadOrgNodes(userId: string) {
  const rows = await prisma.orgEntity.findMany({ where: { userId } });
  return rows.map((r) => ({ key: r.key, kind: r.kind as 'human' | 'persona' | 'agent', name: r.name, role: r.role, tier: r.tier as 0 | 1 | 2 | 3 | 4, directorate: r.directorate, department: r.department, managerKey: r.managerKey, roles: r.roles }));
}

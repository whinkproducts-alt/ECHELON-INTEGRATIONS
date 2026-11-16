/**
 * KPI definitions. Targets and weights come from the owner only (no defaults). An entity can never edit its own KPI:
 * the only caller is the owner-checked route, and setKpi also refuses when the actor is the subject.
 */
import { prisma } from '@/lib/db';
import { writeLedger } from '@/lib/ledger';
import { MEASURE_CODES, type MeasureCode } from '@/lib/org/measures';

export interface KpiInput { entityKey: string; measureCode: string; target: number; weight: number; periodDays: number }

export function validateKpi(i: KpiInput): string | null {
  if (!(MEASURE_CODES as readonly string[]).includes(i.measureCode)) return 'unknown measure code';
  if (!Number.isFinite(i.target) || i.target < 0) return 'target must be a number, 0 or more';
  if (!Number.isFinite(i.weight) || i.weight <= 0 || i.weight > 1) return 'weight must be above 0 and at most 1';
  if (!Number.isInteger(i.periodDays) || i.periodDays < 7 || i.periodDays > 366) return 'period must be 7 to 366 days';
  return null;
}

export async function setKpi(userId: string, actorKey: string | null, i: KpiInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = validateKpi(i);
  if (bad) return { ok: false, error: bad };
  if (actorKey && actorKey === i.entityKey) return { ok: false, error: 'an entity cannot set its own KPI' };
  if (!(await prisma.orgEntity.findUnique({ where: { userId_key: { userId, key: i.entityKey } }, select: { id: true } }))) return { ok: false, error: 'unknown entity' };
  await prisma.orgKpi.upsert({
    where: { userId_entityKey_measureCode: { userId, entityKey: i.entityKey, measureCode: i.measureCode } },
    create: { userId, ...i }, update: { target: i.target, weight: i.weight, periodDays: i.periodDays },
  });
  await writeLedger({ userId, initiator: 'user', action: 'org_kpi_set', permissionClass: 'A', status: 'EXECUTED', confirmationMethod: 'user_confirmed', metadata: { entityKey: i.entityKey, measure: i.measureCode, target: i.target, weight: i.weight } });
  return { ok: true };
}

export async function deleteKpi(userId: string, entityKey: string, measureCode: MeasureCode | string) {
  const r = await prisma.orgKpi.deleteMany({ where: { userId, entityKey, measureCode } });
  if (r.count) await writeLedger({ userId, initiator: 'user', action: 'org_kpi_deleted', permissionClass: 'A', status: 'EXECUTED', metadata: { entityKey, measure: measureCode } });
  return r.count > 0;
}

export async function setPolicy(userId: string, p: { promotionThreshold: number | null; periodsRequired: number | null }) {
  if (p.promotionThreshold !== null && !(p.promotionThreshold >= 0 && p.promotionThreshold <= 1)) return { ok: false as const, error: 'threshold must be 0 to 1' };
  if (p.periodsRequired !== null && !(Number.isInteger(p.periodsRequired) && p.periodsRequired >= 1 && p.periodsRequired <= 24)) return { ok: false as const, error: 'periods must be 1 to 24' };
  await prisma.orgPolicy.upsert({ where: { userId }, create: { userId, ...p }, update: p });
  await writeLedger({ userId, initiator: 'user', action: 'org_policy_set', permissionClass: 'A', status: 'EXECUTED', metadata: { ...p } });
  return { ok: true as const };
}

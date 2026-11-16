/**
 * The ONLY writer of OrgKpiScore (a test greps for any other). Scores come from ledger and task rows through the fixed
 * measures; no entity or route can write one. Idempotent: one row per entity, measure and period.
 */
import { prisma } from '@/lib/db';
import { writeLedger } from '@/lib/ledger';
import { measure, meets, type MeasureCode } from '@/lib/org/measures';
import { loadOrgNodes } from '@/lib/org/seed';
import { proposeFromScores } from '@/lib/org/promotion';

const DAY = 86_400_000;

/** Last completed epoch-aligned window of periodDays. */
export function lastWindow(now: Date, periodDays: number): { from: Date; to: Date } {
  const len = periodDays * DAY;
  const idx = Math.floor(now.getTime() / len);
  return { from: new Date((idx - 1) * len), to: new Date(idx * len) };
}

export async function runScoring(userId: string, now = new Date()): Promise<{ scored: number; noEvidence: number; proposals: number }> {
  const kpis = await prisma.orgKpi.findMany({ where: { userId } });
  if (kpis.length === 0) return { scored: 0, noEvidence: 0, proposals: 0 };
  const nodes = new Map((await loadOrgNodes(userId)).map((n) => [n.key, n]));
  let scored = 0; let noEvidence = 0;
  for (const k of kpis) {
    const node = nodes.get(k.entityKey);
    if (!node) continue;
    const { from, to } = lastWindow(now, k.periodDays);
    const m = await measure(k.measureCode as MeasureCode, userId, node, from, to);
    const meetsTarget = meets(k.measureCode as MeasureCode, m.value, k.target);
    await prisma.orgKpiScore.upsert({
      where: { userId_entityKey_measureCode_periodStart: { userId, entityKey: k.entityKey, measureCode: k.measureCode, periodStart: from } },
      create: { userId, entityKey: k.entityKey, measureCode: k.measureCode, periodStart: from, periodEnd: to, value: m.value, meetsTarget, evidence: m.evidence },
      update: { value: m.value, meetsTarget, evidence: m.evidence, periodEnd: to },
    });
    scored++; if (m.value === null) noEvidence++;
  }
  const proposals = await proposeFromScores(userId, kpis, nodes);
  await writeLedger({ userId, initiator: 'system', action: 'org_kpi_scored', permissionClass: 'A', status: 'EXECUTED', metadata: { scored, noEvidence, proposals } });
  return { scored, noEvidence, proposals };
}

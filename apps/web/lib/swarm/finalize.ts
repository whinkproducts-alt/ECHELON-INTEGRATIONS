/**
 * End of run: send what the swarm learnt to the CENTRAL memory, store the consolidated report, close the run.
 * Only reviewer-approved worker learnings above the confidence threshold become memory. Writes go through
 * checkPermission (capability swarm_memory_write, Class A) and the existing memory pipeline (dedup on write),
 * as INFERRED with confidence capped at 0.6 and the run id as provenance.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { writeLedger } from '@/lib/ledger';
import { runGuarded } from '@/lib/guarded-action';
import { writeMemory } from '@/lib/memory-engine';
import { swarmConfig } from './config';

type T = { lane: string; role: string; status: string; covers: string[]; output: unknown };
type L = { lane: string; text: string; confidence: number };

const outOf = (t: T) => (t.output ?? {}) as { result?: string; verdicts?: Array<{ lane: string; approved: boolean }> };

/** Worker lanes that every DONE reviewer covering them approved (and at least one did). */
export function approvedLanes(tasks: T[]): Set<string> {
  const approved = new Set<string>();
  const workers = tasks.filter((t) => t.role === 'worker' && t.status === 'DONE');
  for (const w of workers) {
    const reviewers = tasks.filter((t) => t.role === 'reviewer' && t.status === 'DONE' && t.covers.includes(w.lane));
    if (reviewers.length === 0) continue;
    const ok = reviewers.every((r) => outOf(r).verdicts?.some((v) => v.lane === w.lane && v.approved === true));
    if (ok) approved.add(w.lane);
  }
  return approved;
}

export function acceptedLearnings(tasks: T[], learnings: L[], threshold: number): L[] {
  const lanes = approvedLanes(tasks);
  return learnings.filter((l) => lanes.has(l.lane) && l.confidence >= threshold).sort((a, b) => b.confidence - a.confidence || (a.text < b.text ? -1 : 1));
}

export function consolidatedReport(tasks: T[]): string {
  const cfg = swarmConfig();
  const lead = tasks.find((t) => t.role === 'lead' && t.status === 'DONE');
  if (lead && outOf(lead).result) return String(outOf(lead).result).slice(0, cfg.resultMaxChars);
  const sections = tasks.filter((t) => t.role === 'integrator' && t.status === 'DONE').map((t) => `## ${t.lane}\n${outOf(t).result ?? ''}`);
  return sections.join('\n\n').slice(0, cfg.resultMaxChars);
}

export async function finalizeRun(runId: string, userId: string, opts: { resume?: boolean } = {}): Promise<void> {
  if (!userId) throw new Error('swarm: userId is required');
  const cfg = swarmConfig();
  if (!opts.resume) {
    const claimed = await prisma.swarmRun.updateMany({ where: { id: runId, userId, status: 'RUNNING' }, data: { status: 'FINALIZING' } });
    if (claimed.count !== 1) return; // someone else is finalising, or the run is already closed
  }
  const run = await prisma.swarmRun.findFirst({ where: { id: runId, userId } });
  if (!run) return;
  const tasks = (await prisma.swarmTask.findMany({ where: { runId, userId } })) as T[];
  const learnings = (await prisma.swarmLearning.findMany({ where: { runId, userId } })) as L[];
  const cancelled = run.cancelRequested;
  const accepted = acceptedLearnings(tasks, learnings, cfg.memoryConfidenceThreshold).slice(0, cfg.maxMemoryWrites);
  const report = cancelled ? '' : consolidatedReport(tasks);

  let written = 0;
  let deduped = 0;
  let memoryOk = true;
  const guarded = await runGuarded(
    { userId, capability: 'swarm_memory_write', permissionClass: 'A', action: 'swarm_memory_written', correlationId: runId, persona: 'WHINK',
      summary: `run=${runId} accepted=${accepted.length} report=${report ? 1 : 0}` },
    async () => {
      for (const l of accepted) {
        try {
          const r = await writeMemory({
            userId, type: 'semantic', statement: l.text, projectId: run.projectId ?? null, source: 'swarm', sourceId: runId,
            confidence: Math.min(l.confidence, cfg.memoryConfidenceCap), epistemicStatus: 'INFERRED',
          });
          if (r.deduped) deduped++; else written++;
        } catch (e) { logger.warn('swarm memory write failed', { runId, error: (e as Error)?.message }); }
      }
      if (report) {
        try {
          await writeMemory({
            userId, type: 'episodic', eventType: 'swarm_report', projectId: run.projectId ?? null, source: 'swarm', sourceId: runId,
            statement: `Swarm report (run ${runId}): ${run.title}\n${report.slice(0, 1500)}`, confidence: cfg.memoryConfidenceCap, eventDate: new Date(),
          });
        } catch (e) { logger.warn('swarm report memory failed', { runId, error: (e as Error)?.message }); }
      }
      return true;
    },
  );
  if (!guarded.ok) memoryOk = false;

  const status = cancelled ? 'CANCELLED' : run.stopReason === 'budget_hard_limit' ? 'FAILED' : report ? 'DONE' : 'FAILED';
  await prisma.swarmRun.updateMany({
    where: { id: runId, userId },
    data: { status, result: report || null, finishedAt: new Date(), stopReason: run.stopReason ?? (cancelled ? 'cancelled' : null) },
  });
  const count = (s: string) => tasks.filter((t) => t.status === s).length;
  await writeLedger({
    userId, action: 'swarm_finished', tool: 'swarm', permissionClass: 'A', status: status === 'FAILED' ? 'FAILED' : 'EXECUTED',
    initiator: 'system', persona: 'WHINK', correlationId: runId,
    metadata: { status, done: count('DONE'), failed: count('FAILED'), skipped: count('SKIPPED'), learnings: learnings.length, accepted: accepted.length, written, deduped, memoryOk },
  });
}

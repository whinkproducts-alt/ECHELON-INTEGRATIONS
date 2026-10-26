/**
 * memory_curation (nightly): scope 'dedupe' supersedes near-duplicate semantic memories (cosine
 * similarity from stored embeddings, same embedding model, same user); scope 'decay' lowers
 * confidence of stale, low-confidence, non-KNOWN memories. User-confirmed (KNOWN) memories are
 * never superseded, never decayed, never deleted. Nothing is deleted at all. Uses existing columns only.
 */
import { prisma } from '@/lib/db';
import { workerMemoryGate, type JobContext } from '@/lib/worker/context';
import { THRESHOLD } from '@/lib/worker/jobs/util';

interface Pair { keepId: string; keepStatus: string; keepConf: number; dupId: string; dupStatus: string; dupConf: number }

export async function memoryCuration(ctx: JobContext): Promise<void> {
  const scope = ctx.params.scope;
  if (scope === 'dedupe') return dedupe(ctx);
  if (scope === 'decay') return decay(ctx);
  throw new Error('unknown curation scope');
}

async function dedupe(ctx: JobContext): Promise<void> {
  if (!(await workerMemoryGate(ctx))) return;
  const minSim = THRESHOLD('WORKER_CURATION_SIMILARITY', 0.95);
  const maxDist = 1 - minSim;
  // Fixed parameterised query, bound userId on both sides of the join. Newest 300 live rows only.
  const rows = await prisma.$queryRaw<Array<{ aid: string; astatus: string; aconf: number; bid: string; bstatus: string; bconf: number }>>`
    WITH recent AS (
      SELECT id, "epistemicStatus", confidence, embedding, "embeddingModel"
      FROM memory_semantic
      WHERE "userId" = ${ctx.userId} AND "supersededBy" IS NULL AND embedding IS NOT NULL
      ORDER BY "createdAt" DESC LIMIT 300
    )
    SELECT a.id AS aid, a."epistemicStatus" AS astatus, a.confidence AS aconf,
           b.id AS bid, b."epistemicStatus" AS bstatus, b.confidence AS bconf
    FROM recent a JOIN recent b ON a.id < b.id AND a."embeddingModel" = b."embeddingModel"
    WHERE (a.embedding <=> b.embedding) <= ${maxDist}
    LIMIT 100`;
  ctx.counters.items = rows.length;
  const gone = new Set<string>();
  for (const r of rows) {
    const pair: Pair = { keepId: r.aid, keepStatus: r.astatus, keepConf: r.aconf, dupId: r.bid, dupStatus: r.bstatus, dupConf: r.bconf };
    // Keep the confirmed one; otherwise the more confident one.
    const swap = (pair.keepStatus !== 'KNOWN' && pair.dupStatus === 'KNOWN') || (pair.keepStatus === pair.dupStatus && pair.dupConf > pair.keepConf);
    const keep = swap ? { id: pair.dupId, status: pair.dupStatus } : { id: pair.keepId, status: pair.keepStatus };
    const drop = swap ? { id: pair.keepId, status: pair.keepStatus } : { id: pair.dupId, status: pair.dupStatus };
    if (drop.status === 'KNOWN' || gone.has(drop.id) || gone.has(keep.id)) continue;
    const res = await prisma.memorySemantic.updateMany({
      where: { id: drop.id, userId: ctx.userId, supersededBy: null, NOT: { epistemicStatus: 'KNOWN' } },
      data: { supersededBy: keep.id, supersededAt: ctx.now },
    });
    if (res.count > 0) { ctx.counters.superseded += res.count; gone.add(drop.id); }
  }
}

async function decay(ctx: JobContext): Promise<void> {
  if (!(await workerMemoryGate(ctx))) return;
  const staleDays = THRESHOLD('WORKER_DECAY_STALE_DAYS', 30);
  const cutoff = new Date(ctx.now.getTime() - staleDays * 86_400_000);
  // Multiplicative decay with a floor; updatedAt moves forward so a row decays at most once per stale window.
  const n = await prisma.$executeRaw`
    UPDATE memory_semantic
    SET confidence = GREATEST(confidence * 0.85, 0.05), "updatedAt" = ${ctx.now}
    WHERE "userId" = ${ctx.userId}
      AND "supersededBy" IS NULL
      AND "epistemicStatus" <> 'KNOWN'
      AND confidence < 0.5 AND confidence > 0.05
      AND "updatedAt" < ${cutoff}`;
  ctx.counters.decayed += Number(n);
}

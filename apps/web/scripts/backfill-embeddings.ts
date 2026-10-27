/**
 * Backfill embeddings for memory rows that have no embedding yet.
 *
 * Run with:
 *   pnpm memory:reembed --user <userId>
 *
 * Every run is scoped to a single userId (tenant isolation, A8).
 * Uses keyset pagination (id > $lastId) to avoid OFFSET drift as rows are filled in.
 */

import { PrismaClient } from '@prisma/client';
import { generateEmbedding } from '../lib/embedding-service';
import { recordActionSafe } from '../lib/ledger';

const prisma = new PrismaClient();
const BATCH_SIZE = 20;

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--user');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: pnpm memory:reembed --user <userId>');
    process.exit(1);
  }
  const userId = args[idx + 1].trim();
  if (!userId) {
    console.error('Error: --user value must not be empty');
    process.exit(1);
  }
  return userId;
}

// ── Per-table backfill ────────────────────────────────────────────────────────

async function backfill(
  userId: string,
  table: 'memory_semantic' | 'memory_episodes',
  textColumn: string,
  updateQuery: (id: string, vec: number[]) => Promise<void>,
): Promise<{ processed: number; skipped: number }> {
  // Scoped count query — bound parameter, no string interpolation of user input.
  const countResult = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM ${table} WHERE embedding IS NULL AND "userId" = $1`,
    userId,
  );
  const total = parseInt(countResult[0]?.count ?? '0', 10);

  console.log(`[${table}] Backfilling ${total} rows for userId=${userId}...`);
  if (total === 0) return { processed: 0, skipped: 0 };

  let lastId = ''; // keyset cursor — avoids OFFSET skipping half the rows as embeddings are filled in
  let processed = 0;
  let skipped = 0;

  for (;;) {
    // Keyset pagination: only rows whose embedding is still NULL and id > lastId.
    // Two separate queries (one with, one without the lastId guard) to avoid dynamic WHERE string-building.
    const rows: { id: string; text: string }[] =
      lastId === ''
        ? await prisma.$queryRawUnsafe(
            `SELECT id, "${textColumn}" AS text FROM ${table}
             WHERE embedding IS NULL AND "userId" = $1
             ORDER BY id
             LIMIT $2`,
            userId,
            BATCH_SIZE,
          )
        : await prisma.$queryRawUnsafe(
            `SELECT id, "${textColumn}" AS text FROM ${table}
             WHERE embedding IS NULL AND "userId" = $1 AND id > $2
             ORDER BY id
             LIMIT $3`,
            userId,
            lastId,
            BATCH_SIZE,
          );

    if (rows.length === 0) break;

    for (const row of rows) {
      const vec = await generateEmbedding(row.text);
      if (!vec) {
        skipped++;
        continue;
      }
      await updateQuery(row.id, vec);
      processed++;
    }

    lastId = rows[rows.length - 1].id;
    console.log(`[${table}] ${processed} done, ${skipped} skipped (cursor=${lastId})`);
  }

  console.log(`[${table}] Complete. ${processed} embedded, ${skipped} skipped.`);
  return { processed, skipped };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const userId = parseArgs();
  let totalProcessed = 0;
  let totalEmbedded = 0;

  try {
    const semantic = await backfill(
      userId,
      'memory_semantic',
      'statement',
      async (id, vec) => {
        await prisma.$executeRawUnsafe(
          `UPDATE memory_semantic SET embedding = $1::vector WHERE id = $2 AND "userId" = $3`,
          `[${vec.join(',')}]`,
          id,
          userId,
        );
      },
    );

    const episodes = await backfill(
      userId,
      'memory_episodes',
      'summary',
      async (id, vec) => {
        await prisma.$executeRawUnsafe(
          `UPDATE memory_episodes SET embedding = $1::vector WHERE id = $2 AND "userId" = $3`,
          `[${vec.join(',')}]`,
          id,
          userId,
        );
      },
    );

    totalProcessed = semantic.processed + semantic.skipped + episodes.processed + episodes.skipped;
    totalEmbedded = semantic.processed + episodes.processed;
  } finally {
    // One ledger row per run — counts only, no content.
    await recordActionSafe({
      userId,
      initiator: 'system',
      action: 'memory_backfill_run',
      permissionClass: 'A',
      status: 'SUBMITTED',
      inputSummary: `processed=${totalProcessed} embedded=${totalEmbedded}`,
    });

    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

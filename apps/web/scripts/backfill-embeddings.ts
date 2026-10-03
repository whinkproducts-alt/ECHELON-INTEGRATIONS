/**
 * Backfill embeddings for memory rows that have no embedding yet.
 *
 * Run with:
 *   npx ts-node -P tsconfig.json scripts/backfill-embeddings.ts
 */

import { PrismaClient } from '@prisma/client';
import { generateEmbedding } from '../lib/embedding-service';

const prisma = new PrismaClient();
const BATCH_SIZE = 20;

async function backfill(
  table: 'memory_semantic' | 'memory_episodes',
  countQuery: string,
  fetchQuery: string,
  updateQuery: (id: string, vec: number[]) => Promise<void>,
) {
  const countResult = await prisma.$queryRawUnsafe<{ count: string }[]>(countQuery);
  const total = parseInt(countResult[0]?.count ?? '0', 10);

  console.log(`[${table}] Backfilling ${total} rows...`);
  if (total === 0) return;

  let offset = 0;
  let processed = 0;
  let skipped = 0;

  while (offset < total) {
    const rows = await prisma.$queryRawUnsafe<{ id: string; text: string }[]>(
      fetchQuery,
      BATCH_SIZE,
      offset,
    );

    for (const row of rows) {
      const vec = await generateEmbedding(row.text);
      if (!vec) {
        skipped++;
        continue;
      }
      await updateQuery(row.id, vec);
      processed++;
    }

    offset += rows.length;
    if (rows.length === 0) break;
    console.log(`[${table}] ${processed} done, ${skipped} skipped (${offset}/${total})`);
  }

  console.log(`[${table}] Complete. ${processed} embedded, ${skipped} skipped.`);
}

async function main() {
  try {
    await backfill(
      'memory_semantic',
      `SELECT COUNT(*)::text AS count FROM memory_semantic WHERE embedding IS NULL`,
      `SELECT id, statement AS text FROM memory_semantic WHERE embedding IS NULL LIMIT $1 OFFSET $2`,
      async (id, vec) => {
        await prisma.$executeRawUnsafe(
          `UPDATE memory_semantic SET embedding = $1::vector WHERE id = $2`,
          `[${vec.join(',')}]`,
          id,
        );
      },
    );

    await backfill(
      'memory_episodes',
      `SELECT COUNT(*)::text AS count FROM memory_episodes WHERE embedding IS NULL`,
      `SELECT id, summary AS text FROM memory_episodes WHERE embedding IS NULL LIMIT $1 OFFSET $2`,
      async (id, vec) => {
        await prisma.$executeRawUnsafe(
          `UPDATE memory_episodes SET embedding = $1::vector WHERE id = $2`,
          `[${vec.join(',')}]`,
          id,
        );
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

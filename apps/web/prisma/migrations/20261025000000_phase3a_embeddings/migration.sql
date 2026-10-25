-- Phase 3a: resize pgvector columns from 1536 to 768 (nomic-embed-text), add HNSW indexes,
-- and stamp each row with the embedding model that produced it.
--
-- Existing embeddings are NULL-ed first: they were produced at 1536 dims (OpenAI) but
-- nomic-embed-text is 768. A post-migration backfill (scripts/backfill-embeddings.ts)
-- re-embeds them at the correct dimension.

-- ── memory_episodes ──────────────────────────────────────────────────────────

-- Clear stale embeddings so the type change has no data to migrate
UPDATE "memory_episodes" SET "embedding" = NULL;

-- Recreate the column at the correct dimension
ALTER TABLE "memory_episodes" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "memory_episodes" ADD COLUMN "embedding" vector(768);

-- Record which model embedded each row
ALTER TABLE "memory_episodes" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;

-- ── memory_semantic ───────────────────────────────────────────────────────────

UPDATE "memory_semantic" SET "embedding" = NULL;

ALTER TABLE "memory_semantic" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "memory_semantic" ADD COLUMN "embedding" vector(768);

ALTER TABLE "memory_semantic" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;

-- ── HNSW cosine indexes ───────────────────────────────────────────────────────
-- Note: CONCURRENTLY cannot be used inside a Prisma migration transaction.
-- Index creation here uses a brief exclusive lock (acceptable for dev/migration context).
-- On a live production database, create these indexes manually with CONCURRENTLY.

CREATE INDEX IF NOT EXISTS memory_episodes_embedding_hnsw
  ON "memory_episodes" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS memory_semantic_embedding_hnsw
  ON "memory_semantic" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

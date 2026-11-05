-- C05 founder-private sealed scope + epoch locks (additive), plus restoration of
-- raw-SQL objects that `prisma db push` dropped on the personal instance.
--
-- READ BEFORE TOUCHING THIS SCHEMA:
-- The memory_* tsvector/hnsw objects and rate_limit_buckets are raw SQL and are
-- deliberately NOT declared in schema.prisma. `prisma db push` therefore treats
-- them as drift and DROPS them (it did). Use `prisma migrate deploy` / `migrate dev`
-- on this project; never `db push` against an environment with real memory rows.
-- Every statement below is guarded so this file is safe to replay.

-- ── Urgent outbound contact (Founder phone, encrypted at rest) ────────────────
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "urgentPhoneE164Enc" TEXT;

-- ── sealed objectives ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sealed_objectives" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "directorate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "sealed_objectives_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sealed_objectives_userId_status_idx" ON "sealed_objectives"("userId", "status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sealed_objectives_userId_fkey') THEN
    ALTER TABLE "sealed_objectives"
      ADD CONSTRAINT "sealed_objectives_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── sealed scopes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sealed_scopes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sealed_scopes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sealed_scopes_userId_idx" ON "sealed_scopes"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "sealed_scopes_kind_refId_key" ON "sealed_scopes"("kind", "refId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sealed_scopes_userId_fkey') THEN
    ALTER TABLE "sealed_scopes"
      ADD CONSTRAINT "sealed_scopes_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── safety epoch locks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "safety_epoch_locks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "heldBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "safety_epoch_locks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "safety_epoch_locks_userId_epoch_idx" ON "safety_epoch_locks"("userId", "epoch");
CREATE INDEX IF NOT EXISTS "safety_epoch_locks_scope_expiresAt_idx" ON "safety_epoch_locks"("scope", "expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "safety_epoch_locks_userId_epoch_scope_key" ON "safety_epoch_locks"("userId", "epoch", "scope");

-- ── restore full-text search columns (raw SQL, absent from schema.prisma) ─────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memory_semantic' AND column_name = 'search_vec') THEN
    ALTER TABLE "memory_semantic"
      ADD COLUMN "search_vec" tsvector
      GENERATED ALWAYS AS (to_tsvector('english', "statement")) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memory_episodes' AND column_name = 'search_vec') THEN
    ALTER TABLE "memory_episodes"
      ADD COLUMN "search_vec" tsvector
      GENERATED ALWAYS AS (to_tsvector('english', "summary")) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS memory_semantic_search_vec_idx ON "memory_semantic" USING GIN ("search_vec");
CREATE INDEX IF NOT EXISTS memory_episodes_search_vec_idx ON "memory_episodes" USING GIN ("search_vec");

-- ── restore HNSW cosine indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS memory_episodes_embedding_hnsw
  ON "memory_episodes" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS memory_semantic_embedding_hnsw
  ON "memory_semantic" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── restore Postgres rate-limit buckets ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key", "windowStart")
);

CREATE INDEX IF NOT EXISTS "rate_limit_buckets_windowStart_idx" ON "rate_limit_buckets"("windowStart");

-- ── parity with schema.prisma for columns already reconciled by the push ──────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memory_episodes' AND column_name = 'eventDate' AND data_type <> 'timestamp without time zone') THEN
    ALTER TABLE "memory_episodes" ALTER COLUMN "eventDate" TYPE TIMESTAMP(3) USING ("eventDate" AT TIME ZONE 'UTC');
  END IF;
END $$;

ALTER TABLE "task_handoffs" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "memory_daily_cap" ALTER COLUMN "updatedAt" DROP DEFAULT;

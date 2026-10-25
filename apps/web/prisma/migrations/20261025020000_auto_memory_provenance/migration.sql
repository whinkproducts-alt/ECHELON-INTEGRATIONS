-- Phase 3b Auto Memory: add provenance fields to memory tables and daily cap table.
--
-- B9: messageId and extractorModel track which message and which LLM produced each
--     auto-extracted memory row. eventDate stores absolute resolved event dates for
--     episodic memories (relative dates like "yesterday" are resolved to ISO 8601 by
--     the extraction layer before write).
--
-- B12: memory_daily_cap table tracks per-user daily write counts. A UNIQUE index on
--      (userId, date) allows upsert increments without a read-then-write race.

-- ── memory_episodes ───────────────────────────────────────────────────────────

ALTER TABLE "memory_episodes" ADD COLUMN IF NOT EXISTS "eventDate" TIMESTAMPTZ;
ALTER TABLE "memory_episodes" ADD COLUMN IF NOT EXISTS "messageId" TEXT;
ALTER TABLE "memory_episodes" ADD COLUMN IF NOT EXISTS "extractorModel" TEXT;

-- ── memory_semantic ───────────────────────────────────────────────────────────

ALTER TABLE "memory_semantic" ADD COLUMN IF NOT EXISTS "messageId" TEXT;
ALTER TABLE "memory_semantic" ADD COLUMN IF NOT EXISTS "extractorModel" TEXT;

-- ── memory_daily_cap ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "memory_daily_cap" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "date"      TEXT NOT NULL,
    "count"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_daily_cap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "memory_daily_cap_userId_date_key"
    ON "memory_daily_cap"("userId", "date");

CREATE INDEX IF NOT EXISTS "memory_daily_cap_userId_idx"
    ON "memory_daily_cap"("userId");

-- Migration: budget_envelopes + budget_reservations
-- Run: npx prisma migrate dev --name budget_tables
-- Or apply manually against your Postgres instance.

CREATE TABLE IF NOT EXISTS "budget_envelopes" (
  "id"            TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"        TEXT        NOT NULL,
  "envelopeKind"  TEXT        NOT NULL,
  "periodStart"   TIMESTAMP(3) NOT NULL,
  "limitMicros"   BIGINT      NOT NULL,
  "spentMicros"   BIGINT      NOT NULL DEFAULT 0,
  "state"         TEXT        NOT NULL DEFAULT 'open',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "budget_envelopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "budget_envelopes_userId_envelopeKind_periodStart_key"
  ON "budget_envelopes"("userId", "envelopeKind", "periodStart");

CREATE INDEX IF NOT EXISTS "budget_envelopes_userId_periodStart_idx"
  ON "budget_envelopes"("userId", "periodStart");

-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "budget_reservations" (
  "id"            TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "envelopeId"    TEXT        NOT NULL,
  "attemptKey"    TEXT        NOT NULL,
  "reservedMicros" BIGINT     NOT NULL,
  "state"         TEXT        NOT NULL DEFAULT 'pending',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt"     TIMESTAMP(3),

  CONSTRAINT "budget_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "budget_reservations_envelopeId_fkey"
    FOREIGN KEY ("envelopeId")
    REFERENCES "budget_envelopes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "budget_reservations_envelopeId_attemptKey_key"
  ON "budget_reservations"("envelopeId", "attemptKey");

CREATE INDEX IF NOT EXISTS "budget_reservations_envelopeId_state_idx"
  ON "budget_reservations"("envelopeId", "state");

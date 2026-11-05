-- Additive dispatch-admission columns. Historical rows stay state=recorded with a null attemptKey.
ALTER TABLE "usage_events"
  ADD COLUMN "attemptKey" TEXT,
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'unspecified',
  ADD COLUMN "state" TEXT NOT NULL DEFAULT 'recorded',
  ADD COLUMN "costClass" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "priceKnown" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "reservedMicros" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "estimatedMicros" INTEGER,
  ADD COLUMN "uncertainty" TEXT,
  ADD COLUMN "periodStart" TIMESTAMP(3),
  ADD COLUMN "settledAt" TIMESTAMP(3);
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_reservedMicros_nonnegative" CHECK ("reservedMicros" >= 0);
CREATE UNIQUE INDEX "usage_events_userId_attemptKey_key" ON "usage_events"("userId", "attemptKey");
CREATE INDEX "usage_events_userId_state_periodStart_idx" ON "usage_events"("userId", "state", "periodStart");

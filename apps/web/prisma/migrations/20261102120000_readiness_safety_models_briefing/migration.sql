-- R04 / R07 / R08 functional readiness. Additive only: three new tables, no change to existing rows.

-- R07: account-persisted lockdown
CREATE TABLE "account_safety_states" (
    "userId" TEXT NOT NULL,
    "lockedDown" BOOLEAN NOT NULL DEFAULT false,
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_safety_states_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "account_safety_states" ADD CONSTRAINT "account_safety_states_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- R04: saved model priority profiles
CREATE TABLE "model_routing_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "choices" TEXT[],
    "revision" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_routing_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "model_routing_profiles_userId_name_key" ON "model_routing_profiles"("userId", "name");
CREATE INDEX "model_routing_profiles_userId_active_idx" ON "model_routing_profiles"("userId", "active");
-- At most one active profile per user, enforced by the database, not only by application code.
CREATE UNIQUE INDEX "model_routing_profiles_one_active_per_user" ON "model_routing_profiles"("userId") WHERE "active";
-- Between 1 and 3 choices.
ALTER TABLE "model_routing_profiles" ADD CONSTRAINT "model_routing_profiles_choices_len"
    CHECK (cardinality("choices") BETWEEN 1 AND 3);

ALTER TABLE "model_routing_profiles" ADD CONSTRAINT "model_routing_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- R08: daily Board Room briefing
CREATE TABLE "daily_briefings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "sourceHash" TEXT NOT NULL,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "scriptEnc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "error" TEXT,
    "sourceCutoff" TIMESTAMP(3) NOT NULL,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_briefings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_briefings_userId_localDate_revision_key" ON "daily_briefings"("userId", "localDate", "revision");
CREATE INDEX "daily_briefings_userId_localDate_idx" ON "daily_briefings"("userId", "localDate");

ALTER TABLE "daily_briefings" ADD CONSTRAINT "daily_briefings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

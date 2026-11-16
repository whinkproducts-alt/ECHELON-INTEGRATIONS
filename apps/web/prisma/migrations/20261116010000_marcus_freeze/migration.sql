CREATE TABLE "marcus_freezes" (
    "userId" TEXT NOT NULL,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marcus_freezes_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "marcus_freezes" ADD CONSTRAINT "marcus_freezes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Move the old sentinel AgentJob rows into the table, then remove them.
INSERT INTO "marcus_freezes" ("userId", "frozen", "updatedAt")
SELECT "userId", "lastStatus" = 'freeze_on', NOW() FROM "agent_jobs" WHERE "jobKey" = 'marcus:__freeze__';
DELETE FROM "agent_jobs" WHERE "jobKey" = 'marcus:__freeze__';

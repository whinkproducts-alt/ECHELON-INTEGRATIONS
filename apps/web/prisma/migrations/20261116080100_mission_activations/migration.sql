CREATE TABLE "mission_activations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    CONSTRAINT "mission_activations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mission_activations_userId_missionId_agentId_key" ON "mission_activations"("userId", "missionId", "agentId");
CREATE INDEX "mission_activations_userId_status_idx" ON "mission_activations"("userId", "status");
ALTER TABLE "mission_activations" ADD CONSTRAINT "mission_activations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

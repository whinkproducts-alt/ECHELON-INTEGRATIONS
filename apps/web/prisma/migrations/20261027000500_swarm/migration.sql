-- CreateTable
CREATE TABLE "swarm_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "subsidiary" TEXT,
    "title" TEXT NOT NULL,
    "initiative" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "minAgents" INTEGER NOT NULL,
    "agentCount" INTEGER NOT NULL,
    "estimate" JSONB NOT NULL,
    "tokenCap" INTEGER NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "stopReason" TEXT,
    "result" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swarm_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swarm_tasks" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "fit" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "deliverable" TEXT NOT NULL,
    "requiredSkills" TEXT[],
    "covers" TEXT[],
    "dependsOn" TEXT[],
    "estimatedCalls" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "output" JSONB,
    "error" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "claimOwner" TEXT,
    "startedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swarm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swarm_claims" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swarm_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swarm_learnings" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swarm_learnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "swarm_runs_userId_createdAt_idx" ON "swarm_runs"("userId", "createdAt");
CREATE INDEX "swarm_tasks_runId_status_idx" ON "swarm_tasks"("runId", "status");
CREATE INDEX "swarm_tasks_userId_idx" ON "swarm_tasks"("userId");
CREATE UNIQUE INDEX "swarm_tasks_runId_lane_key" ON "swarm_tasks"("runId", "lane");
CREATE INDEX "swarm_claims_userId_idx" ON "swarm_claims"("userId");
CREATE UNIQUE INDEX "swarm_claims_runId_lane_key" ON "swarm_claims"("runId", "lane");
CREATE INDEX "swarm_learnings_runId_createdAt_idx" ON "swarm_learnings"("runId", "createdAt");
CREATE INDEX "swarm_learnings_userId_idx" ON "swarm_learnings"("userId");
CREATE UNIQUE INDEX "swarm_learnings_runId_sha256_key" ON "swarm_learnings"("runId", "sha256");

-- AddForeignKey
ALTER TABLE "swarm_runs" ADD CONSTRAINT "swarm_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "swarm_tasks" ADD CONSTRAINT "swarm_tasks_runId_fkey" FOREIGN KEY ("runId") REFERENCES "swarm_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "swarm_claims" ADD CONSTRAINT "swarm_claims_runId_fkey" FOREIGN KEY ("runId") REFERENCES "swarm_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "swarm_learnings" ADD CONSTRAINT "swarm_learnings_runId_fkey" FOREIGN KEY ("runId") REFERENCES "swarm_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

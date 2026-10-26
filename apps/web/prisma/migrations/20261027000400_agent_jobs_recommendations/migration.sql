-- CreateTable
CREATE TABLE "agent_jobs" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_heartbeats" (
    "workerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "version" TEXT NOT NULL,

    CONSTRAINT "agent_heartbeats_pkey" PRIMARY KEY ("workerId")
);

-- CreateTable
CREATE TABLE "news_seen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linkHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_seen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_jobs_jobKey_userId_key" ON "agent_jobs"("jobKey", "userId");
CREATE INDEX "agent_jobs_nextRunAt_idx" ON "agent_jobs"("nextRunAt");
CREATE INDEX "agent_jobs_userId_idx" ON "agent_jobs"("userId");
CREATE UNIQUE INDEX "news_seen_userId_linkHash_key" ON "news_seen"("userId", "linkHash");
CREATE INDEX "news_seen_createdAt_idx" ON "news_seen"("createdAt");
CREATE UNIQUE INDEX "recommendations_userId_dedupeKey_key" ON "recommendations"("userId", "dedupeKey");
CREATE INDEX "recommendations_userId_dismissedAt_createdAt_idx" ON "recommendations"("userId", "dismissedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "news_seen" ADD CONSTRAINT "news_seen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

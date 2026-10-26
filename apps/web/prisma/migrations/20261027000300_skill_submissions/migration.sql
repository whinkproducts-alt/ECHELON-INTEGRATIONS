-- CreateTable
CREATE TABLE "skill_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "content" TEXT NOT NULL,
    "scanReport" JSONB,
    "committee" JSONB,
    "decision" TEXT,
    "reason" TEXT,
    "memoryIds" TEXT[],
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_submissions_userId_sha256_key" ON "skill_submissions"("userId", "sha256");

-- CreateIndex
CREATE INDEX "skill_submissions_userId_createdAt_idx" ON "skill_submissions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "skill_submissions_status_updatedAt_idx" ON "skill_submissions"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "skill_submissions" ADD CONSTRAINT "skill_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

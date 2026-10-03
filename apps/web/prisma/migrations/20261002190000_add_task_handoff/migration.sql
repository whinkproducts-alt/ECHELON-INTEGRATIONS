-- CreateTable
CREATE TABLE "task_handoffs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "approach" TEXT NOT NULL,
    "blockers" TEXT,
    "nextSteps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_handoffs_taskId_idx" ON "task_handoffs"("taskId");

-- CreateIndex
CREATE INDEX "task_handoffs_agentId_idx" ON "task_handoffs"("agentId");

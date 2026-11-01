-- CreateTable
CREATE TABLE "agent_knowledge" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_knowledge_agentId_idx" ON "agent_knowledge"("agentId");

-- CreateIndex
CREATE INDEX "agent_knowledge_domain_idx" ON "agent_knowledge"("domain");

-- CreateIndex
CREATE INDEX "agent_knowledge_taskType_idx" ON "agent_knowledge"("taskType");

-- M1: Add accountId to AgentKnowledge for tenant isolation
ALTER TABLE "agent_knowledge" ADD COLUMN "account_id" TEXT;
CREATE INDEX "agent_knowledge_account_id_idx" ON "agent_knowledge"("account_id");

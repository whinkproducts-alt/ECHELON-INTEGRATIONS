-- Additive M1 state, using agent_jobs for scheduling and existing approvals for authority.
CREATE TABLE "agent_executions" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
 "approvalId" TEXT NOT NULL UNIQUE, "contentHash" TEXT NOT NULL,
 "agentIds" TEXT[] NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "attempts" INTEGER NOT NULL DEFAULT 0, "claimToken" TEXT, "output" JSONB, "reason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("approvalId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "agent_executions_userId_status_idx" ON "agent_executions"("userId", "status");

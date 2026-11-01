-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tool" TEXT,
    "params" JSONB,
    "contentHash" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "permissionClass" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "correlationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "persona" TEXT NOT NULL DEFAULT 'WHINK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "result" JSONB,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_requests_userId_status_expiresAt_idx" ON "approval_requests"("userId", "status", "expiresAt");

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

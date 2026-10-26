-- CreateTable
CREATE TABLE "change_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "spec" JSONB,
    "risk" TEXT,
    "approvalId" TEXT,
    "githubIssueUrl" TEXT,
    "githubIssueNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "subsidiary" TEXT,
    "projectId" TEXT,
    "valueAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_requests_userId_status_idx" ON "change_requests"("userId", "status");

-- CreateIndex
CREATE INDEX "change_requests_userId_createdAt_idx" ON "change_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "contracts_userId_status_idx" ON "contracts"("userId", "status");

-- CreateIndex
CREATE INDEX "contracts_userId_subsidiary_idx" ON "contracts"("userId", "subsidiary");

-- CreateIndex
CREATE INDEX "contracts_userId_projectId_idx" ON "contracts"("userId", "projectId");

-- CreateIndex
CREATE INDEX "contracts_userId_createdAt_id_idx" ON "contracts"("userId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

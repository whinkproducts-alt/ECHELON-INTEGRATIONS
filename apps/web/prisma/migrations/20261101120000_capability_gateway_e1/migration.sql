-- Capability Gateway E1 (additive only). Adds hosts, capability_grants and nullable columns.
-- No DROP, no type change, no default removal. Pre-existing schema drift reported by `migrate diff`
-- (memory_* hnsw/search_vec objects created by raw SQL, defaults) is deliberately NOT touched here.

-- AlterTable
ALTER TABLE "actions" ADD COLUMN     "approvalId" TEXT,
ADD COLUMN     "capabilityId" TEXT,
ADD COLUMN     "connectorInstallId" TEXT,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "grantId" TEXT,
ADD COLUMN     "hostId" TEXT;

-- AlterTable
ALTER TABLE "connector_installs" ADD COLUMN     "args" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "command" TEXT,
ADD COLUMN     "credentialHint" TEXT,
ADD COLUMN     "credentialsEnc" TEXT,
ADD COLUMN     "disabledReason" TEXT,
ADD COLUMN     "egressAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "endpoint" TEXT,
ADD COLUMN     "hostId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CATALOG',
ADD COLUMN     "maxDataClass" TEXT NOT NULL DEFAULT 'organization',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "reviewedFingerprint" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'REGISTERED',
ADD COLUMN     "transport" TEXT;

-- AlterTable
ALTER TABLE "tools" ADD COLUMN     "connectorInstallId" TEXT,
ADD COLUMN     "costClass" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "defHash" TEXT,
ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "reviewedDefHash" TEXT,
ADD COLUMN     "timeoutMs" INTEGER NOT NULL DEFAULT 30000;

-- CreateTable
CREATE TABLE "hosts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REMOTE',
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "tokenHash" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastHeartbeat" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "executionPlanId" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxInvocations" INTEGER,
    "invocationCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "grantedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInvokedAt" TIMESTAMP(3),

    CONSTRAINT "capability_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hosts_userId_status_idx" ON "hosts"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hosts_userId_name_key" ON "hosts"("userId", "name");

-- CreateIndex
CREATE INDEX "capability_grants_userId_subjectType_subjectId_idx" ON "capability_grants"("userId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "capability_grants_toolId_idx" ON "capability_grants"("toolId");

-- CreateIndex
CREATE INDEX "actions_connectorInstallId_idx" ON "actions"("connectorInstallId");

-- CreateIndex
CREATE INDEX "actions_capabilityId_idx" ON "actions"("capabilityId");

-- CreateIndex
CREATE INDEX "actions_hostId_idx" ON "actions"("hostId");

-- CreateIndex
CREATE INDEX "connector_installs_kind_status_idx" ON "connector_installs"("kind", "status");

-- CreateIndex
CREATE INDEX "connector_installs_hostId_idx" ON "connector_installs"("hostId");

-- CreateIndex
CREATE INDEX "tools_connectorInstallId_idx" ON "tools"("connectorInstallId");

-- AddForeignKey
ALTER TABLE "tools" ADD CONSTRAINT "tools_connectorInstallId_fkey" FOREIGN KEY ("connectorInstallId") REFERENCES "connector_installs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_connectorInstallId_fkey" FOREIGN KEY ("connectorInstallId") REFERENCES "connector_installs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "tools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "hosts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_installs" ADD CONSTRAINT "connector_installs_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "hosts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_executionPlanId_fkey" FOREIGN KEY ("executionPlanId") REFERENCES "execution_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

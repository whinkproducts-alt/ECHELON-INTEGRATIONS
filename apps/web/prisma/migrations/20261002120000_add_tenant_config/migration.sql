-- CreateTable
CREATE TABLE "tenant_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT 'WHINK',
    "logoUrl" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#38B6FF',
    "supportUrl" TEXT,
    "privacyUrl" TEXT,
    "termsUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_config_tenantId_key" ON "tenant_config"("tenantId");

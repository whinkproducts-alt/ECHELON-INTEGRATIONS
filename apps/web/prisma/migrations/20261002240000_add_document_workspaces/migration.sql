-- CreateTable
CREATE TABLE "document_workspaces" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_workspaces_userId_workspaceSlug_key" ON "document_workspaces"("userId", "workspaceSlug");

-- CreateIndex
CREATE INDEX "document_workspaces_userId_idx" ON "document_workspaces"("userId");
